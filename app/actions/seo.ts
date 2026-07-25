"use server";

import { revalidatePath } from "next/cache";
import prisma, { systemPrisma } from "@/lib/prisma";
import { requireTenantAdmin, requirePlatformAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { tErr } from "@/lib/action-errors";

export interface SeoState {
  error?: string;
  ok?: boolean;
}

const LIMITS = {
  title: 70,
  description: 200,
  keywords: 300,
  siteName: 60,
  titleTemplate: 60,
  handle: 20,
  url: 500,
} as const;

/** Trim, collapse whitespace, cap — empty becomes null so defaults kick back in. */
function text(value: FormDataEntryValue | null, max: number): string | null {
  const v = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return v.length > 0 ? v : null;
}

/**
 * Only http(s) and site-relative paths. A `javascript:` or `data:` URL in an
 * og:image would be echoed into the page head verbatim.
 */
function imageUrl(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim().slice(0, LIMITS.url);
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try {
    const url = new URL(v);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- Creator
export async function updateTenantSeoAction(
  _prev: SeoState,
  fd: FormData,
): Promise<SeoState> {
  const slug = String(fd.get("tenant") || "");
  const { tenant, user } = await requireTenantAdmin(slug);

  const rawImage = String(fd.get("seoImageUrl") || "").trim();
  const seoImageUrl = imageUrl(fd.get("seoImageUrl"));
  if (rawImage && !seoImageUrl) return { error: await tErr("seoImageInvalid") };

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      seoTitle: text(fd.get("seoTitle"), LIMITS.title),
      seoDescription: text(fd.get("seoDescription"), LIMITS.description),
      seoKeywords: text(fd.get("seoKeywords"), LIMITS.keywords),
      seoImageUrl,
      seoNoindex: fd.get("seoNoindex") === "on",
    },
  });

  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "tenant.seo.update",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { noindex: fd.get("seoNoindex") === "on" },
  });

  // Die Metadaten haengen am Community-Layout, nicht an einer einzelnen Seite.
  revalidatePath(`/c/${slug}`, "layout");
  revalidatePath(`/dashboard/${slug}/seo`);
  return { ok: true };
}

// -------------------------------------------------------------- Platform
export async function updatePlatformSeoAction(
  _prev: SeoState,
  fd: FormData,
): Promise<SeoState> {
  const admin = await requirePlatformAdmin();

  const rawImage = String(fd.get("imageUrl") || "").trim();
  const image = imageUrl(fd.get("imageUrl"));
  if (rawImage && !image) return { error: await tErr("seoImageInvalid") };

  const rawTemplate = text(fd.get("titleTemplate"), LIMITS.titleTemplate);
  // Ohne %s waere jede Unterseite gleich betitelt — das ist kaputt, nicht leer.
  if (rawTemplate && !rawTemplate.includes("%s")) {
    return { error: await tErr("seoTemplateInvalid") };
  }

  const data = {
    siteName: text(fd.get("siteName"), LIMITS.siteName),
    title: text(fd.get("title"), LIMITS.title),
    titleTemplate: rawTemplate,
    description: text(fd.get("description"), LIMITS.description),
    keywords: text(fd.get("keywords"), LIMITS.keywords),
    imageUrl: image,
    twitterHandle: text(fd.get("twitterHandle"), LIMITS.handle),
    noindex: fd.get("noindex") === "on",
    updatedById: admin.id,
  };

  await systemPrisma.platformSeo.upsert({
    where: { id: "platform" },
    create: { id: "platform", ...data },
    update: data,
  });

  await writeAudit({
    actorUserId: admin.id,
    action: "admin.seo.update",
    targetType: "PlatformSeo",
    targetId: "platform",
    metadata: { noindex: data.noindex },
  });

  // Der Root-Layout-Titel und robots.txt haengen daran.
  revalidatePath("/", "layout");
  revalidatePath("/admin/seo");
  return { ok: true };
}
