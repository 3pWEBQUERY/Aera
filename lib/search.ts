import "server-only";
import prisma from "./prisma";
import { canAccess, type AccessContext } from "./entitlements";
import type { Space } from "@/app/generated/prisma/client";

/**
 * Community-weite Suche über Beiträge, Kurse, Wissensartikel, Events und
 * Produkte (case-insensitive Substring; pg_trgm-GIN-Indizes beschleunigen die
 * großen Tabellen — siehe Migration `search_indexes`).
 *
 * Zugriffskontrolle: Jeder Treffer wird gegen die Sichtbarkeit seines Spaces
 * (bzw. seinen Entitlement-Key) geprüft — die Suche verrät nichts, was die
 * Person nicht ohnehin sehen dürfte. Gesperrte Inhalte erscheinen als
 * gesperrter Treffer ohne Inhalts-Auszug.
 */

export type SearchResultType = "post" | "course" | "knowledge" | "event" | "product";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  excerpt: string | null;
  href: string;
  spaceName: string | null;
  locked: boolean;
}

const MAX_QUERY = 80;
const PER_TYPE = 8;

function excerptOf(text: string | null | undefined, query: string): string | null {
  if (!text) return null;
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return null;
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, idx - 60);
  const slice = plain.slice(start, start + 180);
  return (start > 0 ? "…" : "") + slice + (start + 180 < plain.length ? "…" : "");
}

export async function searchCommunity(
  tenantId: string,
  slug: string,
  ctx: AccessContext,
  rawQuery: string,
): Promise<SearchResult[]> {
  const query = rawQuery.trim().slice(0, MAX_QUERY);
  if (query.length < 2) return [];

  const contains = { contains: query, mode: "insensitive" as const };

  const [posts, courses, articles, events, products] = await Promise.all([
    prisma.post.findMany({
      where: {
        tenantId,
        isPublished: true,
        OR: [{ title: contains }, { body: contains }],
      },
      orderBy: { createdAt: "desc" },
      take: PER_TYPE * 2, // Puffer, da gesperrte Treffer gefiltert werden
      include: { space: true },
    }),
    prisma.course.findMany({
      where: {
        tenantId,
        isPublished: true,
        OR: [{ title: contains }, { description: contains }],
      },
      take: PER_TYPE,
      include: { space: true },
    }),
    prisma.knowledgeArticle.findMany({
      where: {
        tenantId,
        isPublished: true,
        OR: [{ title: contains }, { body: contains }],
      },
      take: PER_TYPE,
      include: { space: true },
    }),
    prisma.event.findMany({
      where: {
        tenantId,
        OR: [{ title: contains }, { description: contains }],
      },
      orderBy: { startsAt: "desc" },
      take: PER_TYPE,
      include: { space: true },
    }),
    prisma.product.findMany({
      where: {
        tenantId,
        isPublished: true,
        OR: [{ name: contains }, { description: contains }],
      },
      take: PER_TYPE,
      include: { space: true },
    }),
  ]);

  const results: SearchResult[] = [];

  const spaceAllowed = (space: Space | null) =>
    !space || canAccess(space, ctx);

  for (const p of posts) {
    if (!spaceAllowed(p.space)) continue;
    results.push({
      type: "post",
      id: p.id,
      title: p.title || excerptOf(p.body, query)?.slice(0, 80) || "Beitrag",
      excerpt: excerptOf(p.body, query),
      href: `/c/${slug}/s/${p.space.slug}/${p.id}`,
      spaceName: p.space.name,
      locked: false,
    });
    if (results.length >= PER_TYPE) break;
  }

  for (const c of courses) {
    const locked = c.requiredEntitlementKey
      ? !ctx.isStaff && !ctx.keys.has(c.requiredEntitlementKey)
      : !spaceAllowed(c.space);
    results.push({
      type: "course",
      id: c.id,
      title: c.title,
      excerpt: locked ? null : excerptOf(c.description, query),
      href: `/c/${slug}/s/${c.space.slug}`,
      spaceName: c.space.name,
      locked,
    });
  }

  for (const a of articles) {
    if (!spaceAllowed(a.space)) continue;
    results.push({
      type: "knowledge",
      id: a.id,
      title: a.title,
      excerpt: excerptOf(a.body, query),
      href: `/c/${slug}/s/${a.space.slug}`,
      spaceName: a.space.name,
      locked: false,
    });
  }

  for (const e of events) {
    const locked = e.requiredEntitlementKey
      ? !ctx.isStaff && !ctx.keys.has(e.requiredEntitlementKey)
      : !spaceAllowed(e.space);
    results.push({
      type: "event",
      id: e.id,
      title: e.title,
      excerpt: locked ? null : excerptOf(e.description, query),
      href: `/c/${slug}/s/${e.space.slug}`,
      spaceName: e.space.name,
      locked,
    });
  }

  for (const p of products) {
    // Produkte sind öffentlich sichtbare Verkaufsobjekte.
    results.push({
      type: "product",
      id: p.id,
      title: p.name,
      excerpt: excerptOf(p.description, query),
      href: p.space ? `/c/${slug}/s/${p.space.slug}` : `/c/${slug}`,
      spaceName: p.space?.name ?? null,
      locked: false,
    });
  }

  return results;
}
