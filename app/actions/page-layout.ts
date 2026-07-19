"use server";

import { revalidatePath } from "next/cache";
import prisma, { setTenantContext } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseLayout } from "@/lib/layout";
import { nameStatus } from "@/lib/tenant-name";
import { tErr } from "@/lib/action-errors";
import { activeRoleAtLeast } from "@/lib/tenant";

export interface LayoutState {
  ok?: boolean;
  error?: string;
}

function safeColor(v: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

/**
 * Persist the community page-builder config plus the header fields it edits
 * (name, logo, brand color, "about"). The client submits a single JSON payload.
 */
export async function saveLayoutAction(
  _prev: LayoutState,
  fd: FormData,
): Promise<LayoutState> {
  const slug = String(fd.get("tenant"));
  const user = await getCurrentUser();
  if (!user) return { error: await tErr("notAuthenticated") };

  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) return { error: await tErr("communityNotFound") };
  setTenantContext(tenant.id);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (!activeRoleAtLeast(membership, "MODERATOR")) {
    return { error: await tErr("noPermission") };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(String(fd.get("payload") || "{}"));
  } catch {
    return { error: await tErr("invalidData") };
  }

  const layout = parseLayout({
    sectionsByAudience: payload.sectionsByAudience,
    nav: payload.nav,
    header: payload.header,
  });

  const name = String(payload.name ?? tenant.name).trim().slice(0, 60) || tenant.name;
  if ((await nameStatus(name, slug)) === "taken") {
    return { error: await tErr("siteNameTaken") };
  }
  const logoUrl = typeof payload.logoUrl === "string" ? payload.logoUrl.trim() || null : tenant.logoUrl;
  const description =
    typeof payload.description === "string" ? payload.description.slice(0, 2000) || null : tenant.description;
  const primaryColor = safeColor(String(payload.primaryColor ?? ""), tenant.primaryColor);

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      name,
      logoUrl,
      description,
      primaryColor,
      layout: layout as unknown as object,
    },
  });

  revalidatePath(`/c/${slug}`, "layout");
  revalidatePath(`/c/${slug}`);
  revalidatePath(`/dashboard/${slug}/layout`);
  return { ok: true };
}
