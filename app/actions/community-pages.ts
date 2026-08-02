"use server";

import { revalidatePath } from "next/cache";
import prisma, { setTenantContext } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { tErr } from "@/lib/action-errors";
import { activeRoleAtLeast } from "@/lib/tenant";
import { writeAudit } from "@/lib/audit";
import { sanitizeRichHtml } from "@/lib/rich-text";
import {
  MAX_DESCRIPTION,
  MAX_PAGES,
  MAX_SLUG,
  MAX_TITLE,
  pageSlugFrom,
  parsePageBlocks,
  uniquePageSlug,
  type PageBlock,
} from "@/lib/community-pages";

export interface PagesState {
  ok?: boolean;
  error?: string;
  /** Beim Anlegen: die Kennung der neuen Seite, damit der Editor sie oeffnet. */
  createdId?: string;
}

/**
 * Gemeinsame Eintrittspruefung aller Seiten-Actions.
 *
 * Bewusst dieselbe Schwelle wie beim Layout-Editor (MODERATOR), aus dem diese
 * Actions aufgerufen werden: wer die Startseite umbauen darf, darf auch eine
 * Unterseite schreiben. Eine strengere Schwelle hier wuerde nur bedeuten, dass
 * ein Moderator den Bereich sieht und beim Speichern abprallt.
 */
async function guard(slug: string) {
  const user = await getCurrentUser();
  if (!user) return { error: await tErr("notAuthenticated") } as const;

  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) return { error: await tErr("communityNotFound") } as const;
  setTenantContext(tenant.id);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (!activeRoleAtLeast(membership, "MODERATOR")) {
    return { error: await tErr("noPermission") } as const;
  }
  return { tenant, user } as const;
}

/** Die betroffenen Adressen neu aufbauen lassen. */
function revalidatePage(slug: string, pageSlug?: string) {
  revalidatePath(`/c/${slug}`, "layout");
  revalidatePath(`/c/${slug}`);
  if (pageSlug) revalidatePath(`/c/${slug}/p/${pageSlug}`);
  revalidatePath(`/dashboard/${slug}/layout`);
}

/**
 * Reicht den Text jedes Bausteins durch den Allowlist-Filter.
 *
 * Der Editor schickt HTML, das er selbst erzeugt hat — aber die Action ist die
 * Vertrauensgrenze, nicht der Editor. Was hier ankommt, kann aus jeder Quelle
 * stammen, und die Ausgabe landet auf der oeffentlichen Seite in
 * `dangerouslySetInnerHTML`.
 */
function sanitizeBlocks(blocks: PageBlock[]): PageBlock[] {
  return blocks.map((b) => (b.type === "TEXT" ? { ...b, html: sanitizeRichHtml(b.html) } : b));
}

/** Neue, leere Seite anlegen. Der Titel kommt aus dem Formular. */
export async function createCommunityPageAction(
  _prev: PagesState,
  fd: FormData,
): Promise<PagesState> {
  const slug = String(fd.get("tenant") || "");
  const auth = await guard(slug);
  if ("error" in auth) return auth;

  const existing = await prisma.communityPage.findMany({
    where: { tenantId: auth.tenant.id },
    select: { slug: true, sortOrder: true },
  });
  if (existing.length >= MAX_PAGES) {
    return { error: await tErr("pageLimitReached", { max: MAX_PAGES }) };
  }

  const title = String(fd.get("title") || "").trim().slice(0, MAX_TITLE);
  if (!title) return { error: await tErr("invalidData") };

  const pageSlug = uniquePageSlug(
    pageSlugFrom(title),
    existing.map((p) => p.slug),
  );
  const sortOrder = existing.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;

  const created = await prisma.communityPage.create({
    data: {
      tenantId: auth.tenant.id,
      slug: pageSlug,
      title,
      sortOrder,
      blocks: [],
    },
    select: { id: true },
  });

  await writeAudit({
    tenantId: auth.tenant.id,
    actorUserId: auth.user.id,
    action: "page.create",
    targetType: "CommunityPage",
    targetId: created.id,
    metadata: { slug: pageSlug, title },
  });

  revalidatePage(slug);
  return { ok: true, createdId: created.id };
}

/** Titel, Adresse, Sichtbarkeit und Inhalt einer Seite speichern. */
export async function saveCommunityPageAction(
  _prev: PagesState,
  fd: FormData,
): Promise<PagesState> {
  const slug = String(fd.get("tenant") || "");
  const auth = await guard(slug);
  if ("error" in auth) return auth;

  const id = String(fd.get("pageId") || "");
  const page = await prisma.communityPage.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true, slug: true },
  });
  if (!page) return { error: await tErr("pageNotFound") };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(String(fd.get("payload") || "{}"));
  } catch {
    return { error: await tErr("invalidData") };
  }

  const title = String(payload.title ?? "").trim().slice(0, MAX_TITLE);
  if (!title) return { error: await tErr("pageTitleRequired") };

  // Ein leeres Adressfeld heisst "leite mich aus dem Titel ab" — der Creator
  // soll die Adresse setzen koennen, aber nicht setzen muessen.
  const desired = String(payload.slug ?? "").trim();
  const others = await prisma.communityPage.findMany({
    where: { tenantId: auth.tenant.id, id: { not: page.id } },
    select: { slug: true },
  });
  const pageSlug = uniquePageSlug(
    pageSlugFrom(desired || title).slice(0, MAX_SLUG),
    others.map((p) => p.slug),
  );

  const blocks = sanitizeBlocks(parsePageBlocks(payload.blocks));
  const description = String(payload.description ?? "").trim().slice(0, MAX_DESCRIPTION);
  const status = payload.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const visibility =
    payload.visibility === "MEMBERS" || payload.visibility === "PAID"
      ? payload.visibility
      : "PUBLIC";

  await prisma.communityPage.update({
    where: { id: page.id },
    data: {
      title,
      slug: pageSlug,
      description: description || null,
      status,
      visibility,
      showInNav: payload.showInNav !== false,
      blocks: blocks as unknown as object,
    },
  });

  revalidatePage(slug, pageSlug);
  // Die alte Adresse liegt sonst mit dem alten Inhalt im Cache.
  if (page.slug !== pageSlug) revalidatePath(`/c/${slug}/p/${page.slug}`);
  return { ok: true };
}

/** Seite loeschen. */
export async function deleteCommunityPageAction(
  _prev: PagesState,
  fd: FormData,
): Promise<PagesState> {
  const slug = String(fd.get("tenant") || "");
  const auth = await guard(slug);
  if ("error" in auth) return auth;

  const id = String(fd.get("pageId") || "");
  const page = await prisma.communityPage.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true, slug: true, title: true },
  });
  if (!page) return { error: await tErr("pageNotFound") };

  await prisma.communityPage.delete({ where: { id: page.id } });
  await writeAudit({
    tenantId: auth.tenant.id,
    actorUserId: auth.user.id,
    action: "page.delete",
    targetType: "CommunityPage",
    targetId: page.id,
    metadata: { slug: page.slug, title: page.title },
  });

  revalidatePage(slug, page.slug);
  return { ok: true };
}

/** Reihenfolge der Reiter setzen. Erwartet alle Kennungen in Wunschfolge. */
export async function reorderCommunityPagesAction(
  _prev: PagesState,
  fd: FormData,
): Promise<PagesState> {
  const slug = String(fd.get("tenant") || "");
  const auth = await guard(slug);
  if ("error" in auth) return auth;

  let ids: unknown;
  try {
    ids = JSON.parse(String(fd.get("order") || "[]"));
  } catch {
    return { error: await tErr("invalidData") };
  }
  if (!Array.isArray(ids)) return { error: await tErr("invalidData") };

  const owned = await prisma.communityPage.findMany({
    where: { tenantId: auth.tenant.id },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((p) => p.id));
  // Nur eigene Kennungen, und jede hoechstens einmal: eine praeparierte Liste
  // darf keine fremde Seite anfassen und keine Position doppelt vergeben.
  const order = [...new Set(ids.filter((i): i is string => typeof i === "string"))].filter((i) =>
    ownedIds.has(i),
  );

  await prisma.$transaction(
    order.map((pageId, index) =>
      prisma.communityPage.update({ where: { id: pageId }, data: { sortOrder: index } }),
    ),
  );

  revalidatePage(slug);
  return { ok: true };
}
