import "server-only";
import prisma from "./prisma";
import { PUBLIC_POST_WHERE } from "./post-access";

/**
 * Platform-wide discovery search: communities plus their PUBLIC content.
 *
 * Deliberately different from lib/search.ts, which searches inside one
 * community for one member and can therefore surface gated material. This one
 * runs for anybody, including logged-out visitors, so it only ever reads what
 * is public anyway:
 *
 *   - the community is ACTIVE,
 *   - the content sits in a PUBLIC, non-archived space,
 *   - that space carries no entitlement requirement,
 *   - and the item itself is neither unpublished nor pay-per-view.
 *
 * Everything else stays invisible here. A member searching their own paid
 * material does that inside the community (/c/<slug>/search), where the
 * entitlement context exists.
 */

export type DiscoverResultType =
  | "community"
  | "blog"
  | "post"
  | "course"
  | "event"
  | "product"
  | "knowledge";

export interface DiscoverResult {
  type: DiscoverResultType;
  id: string;
  title: string;
  excerpt: string | null;
  href: string;
  /** Cover/logo, already a public URL. */
  imageUrl: string | null;
  /** Accent colour of the owning community, for the placeholder tile. */
  color: string | null;
  community: { name: string; slug: string } | null;
  spaceName: string | null;
  /** ISO date — events show when they happen, posts when they appeared. */
  date: string | null;
}

export interface DiscoverSearchResponse {
  query: string;
  total: number;
  results: DiscoverResult[];
}

const MAX_QUERY = 80;
export const MIN_QUERY = 2;
const PER_TYPE = 6;

/** Public content lives in a public space of a live community. */
const PUBLIC_SPACE = {
  isArchived: false,
  visibility: "PUBLIC" as const,
  requiredEntitlementKey: null,
  tenant: { status: "ACTIVE" as const },
};

function excerptOf(text: string | null | undefined, query: string): string | null {
  if (!text) return null;
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return null;
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, idx - 60);
  const slice = plain.slice(start, start + 180);
  return (start > 0 ? "…" : "") + slice + (start + 180 < plain.length ? "…" : "");
}

export async function searchPlatform(
  rawQuery: string,
): Promise<DiscoverSearchResponse> {
  const query = rawQuery.trim().slice(0, MAX_QUERY);
  if (query.length < MIN_QUERY) return { query, total: 0, results: [] };

  const contains = { contains: query, mode: "insensitive" as const };
  const now = new Date();

  const [communities, posts, courses, events, products, articles] =
    await Promise.all([
      prisma.tenant.findMany({
        where: {
          status: "ACTIVE",
          OR: [{ name: contains }, { tagline: contains }, { description: contains }],
        },
        orderBy: { createdAt: "desc" },
        take: PER_TYPE * 2,
        select: {
          id: true,
          slug: true,
          name: true,
          tagline: true,
          description: true,
          logoUrl: true,
          primaryColor: true,
        },
      }),
      prisma.post.findMany({
        where: {
          isPublished: true,
          publishedAt: { lte: now },
          // Bezahlte und Mitglieder-Beitraege haben ausserhalb der Community
          // nichts zu suchen — ihr Inhalt ist der Gegenwert.
          ...PUBLIC_POST_WHERE,
          space: PUBLIC_SPACE,
          OR: [{ title: contains }, { body: contains }],
        },
        orderBy: { publishedAt: "desc" },
        take: PER_TYPE * 4,
        include: {
          space: { select: { slug: true, name: true, type: true } },
          tenant: { select: { slug: true, name: true, primaryColor: true } },
        },
      }),
      prisma.course.findMany({
        where: {
          isPublished: true,
          requiredEntitlementKey: null,
          space: PUBLIC_SPACE,
          OR: [{ title: contains }, { description: contains }],
        },
        take: PER_TYPE,
        include: {
          space: { select: { slug: true, name: true } },
          tenant: { select: { slug: true, name: true, primaryColor: true } },
        },
      }),
      prisma.event.findMany({
        where: {
          requiredEntitlementKey: null,
          space: PUBLIC_SPACE,
          OR: [{ title: contains }, { description: contains }],
        },
        orderBy: { startsAt: "asc" },
        take: PER_TYPE,
        include: {
          space: { select: { slug: true, name: true } },
          tenant: { select: { slug: true, name: true, primaryColor: true } },
        },
      }),
      prisma.product.findMany({
        where: {
          space: PUBLIC_SPACE,
          OR: [{ name: contains }, { description: contains }],
        },
        take: PER_TYPE,
        include: {
          space: { select: { slug: true, name: true } },
          tenant: { select: { slug: true, name: true, primaryColor: true } },
        },
      }),
      prisma.knowledgeArticle.findMany({
        where: {
          isPublished: true,
          space: PUBLIC_SPACE,
          OR: [{ title: contains }, { body: contains }],
        },
        take: PER_TYPE,
        include: {
          space: { select: { slug: true, name: true } },
          tenant: { select: { slug: true, name: true, primaryColor: true } },
        },
      }),
    ]);

  const results: DiscoverResult[] = [];

  for (const c of communities.slice(0, PER_TYPE)) {
    results.push({
      type: "community",
      id: c.id,
      title: c.name,
      excerpt: c.tagline || excerptOf(c.description, query),
      href: `/c/${c.slug}`,
      imageUrl: c.logoUrl,
      color: c.primaryColor,
      community: { name: c.name, slug: c.slug },
      spaceName: null,
      date: null,
    });
  }

  // Blog articles get their own group — they read like articles, not feed
  // chatter, and the two are worth telling apart when scanning results.
  const blogs = posts.filter((p) => p.space.type === "BLOG").slice(0, PER_TYPE);
  const otherPosts = posts.filter((p) => p.space.type !== "BLOG").slice(0, PER_TYPE);

  for (const p of [...blogs, ...otherPosts]) {
    results.push({
      type: p.space.type === "BLOG" ? "blog" : "post",
      id: p.id,
      title: p.title || excerptOf(p.body, query)?.slice(0, 70) || p.space.name,
      excerpt: excerptOf(p.body, query),
      href: `/c/${p.tenant.slug}/s/${p.space.slug}/${p.id}`,
      imageUrl: p.imageUrl,
      color: p.tenant.primaryColor,
      community: { name: p.tenant.name, slug: p.tenant.slug },
      spaceName: p.space.name,
      date: p.publishedAt.toISOString(),
    });
  }

  for (const c of courses) {
    results.push({
      type: "course",
      id: c.id,
      title: c.title,
      excerpt: excerptOf(c.description, query),
      href: `/c/${c.tenant.slug}/s/${c.space.slug}`,
      imageUrl: c.coverUrl,
      color: c.tenant.primaryColor,
      community: { name: c.tenant.name, slug: c.tenant.slug },
      spaceName: c.space.name,
      date: null,
    });
  }

  for (const e of events) {
    results.push({
      type: "event",
      id: e.id,
      title: e.title,
      excerpt: excerptOf(e.description, query),
      href: `/c/${e.tenant.slug}/s/${e.space.slug}`,
      imageUrl: e.coverUrl,
      color: e.tenant.primaryColor,
      community: { name: e.tenant.name, slug: e.tenant.slug },
      spaceName: e.space.name,
      date: e.startsAt.toISOString(),
    });
  }

  for (const p of products) {
    results.push({
      type: "product",
      id: p.id,
      title: p.name,
      excerpt: excerptOf(p.description, query),
      href: p.space ? `/c/${p.tenant.slug}/s/${p.space.slug}` : `/c/${p.tenant.slug}`,
      imageUrl: p.coverUrl,
      color: p.tenant.primaryColor,
      community: { name: p.tenant.name, slug: p.tenant.slug },
      spaceName: p.space?.name ?? null,
      date: null,
    });
  }

  for (const a of articles) {
    results.push({
      type: "knowledge",
      id: a.id,
      title: a.title,
      excerpt: excerptOf(a.body, query),
      href: `/c/${a.tenant.slug}/s/${a.space.slug}`,
      imageUrl: null,
      color: a.tenant.primaryColor,
      community: { name: a.tenant.name, slug: a.tenant.slug },
      spaceName: a.space.name,
      date: null,
    });
  }

  return { query, total: results.length, results };
}
