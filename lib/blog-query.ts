import "server-only";
import prisma from "@/lib/prisma";
import { localeChain, publicPostWhere } from "./blog";

/**
 * Die Leseseite des Blogs.
 *
 * Alle oeffentlichen Abfragen laufen hier durch — Uebersicht, Beitragsseite,
 * Feed und Sitemap. Der Grund ist `publicPostWhere`: „oeffentlich" darf genau
 * eine Definition haben. Eine zweite, leicht abweichende Bedingung in der
 * Sitemap waere ein Beitrag, der bei Google auftaucht, bevor er erscheinen
 * sollte — und das faellt niemandem auf, bis es zu spaet ist.
 */

/** Die Felder, die eine Karte in der Uebersicht braucht — nicht der ganze Text. */
const CARD_FIELDS = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverUrl: true,
  coverAlt: true,
  category: true,
  publishedAt: true,
  readingMinutes: true,
  isFeatured: true,
} as const;

export type BlogCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  category: string | null;
  publishedAt: Date | null;
  readingMinutes: number;
  isFeatured: boolean;
};

/**
 * In welcher Sprache der Blog angezeigt wird.
 *
 * Erst die aktive, dann Englisch, dann Deutsch — und zwar die erste, die
 * ueberhaupt etwas enthaelt. Ein leerer franzoesischer Blog waere schlechter
 * als ein englischer; ein Beitrag in der falschen Sprache besser als keiner.
 *
 * `null` heisst: es gibt noch gar keinen veroeffentlichten Beitrag.
 */
export async function resolveBlogLocale(locale: string): Promise<string | null> {
  const chain = localeChain(locale);
  const filled = await prisma.platformPost.groupBy({
    by: ["locale"],
    where: { ...publicPostWhere(), locale: { in: chain } },
    _count: { _all: true },
  });
  const withPosts = new Set(filled.map((entry) => entry.locale));
  return chain.find((entry) => withPosts.has(entry)) ?? null;
}

/** Eine Seite der Uebersicht, optional auf eine Rubrik eingeschraenkt. */
export async function listPosts(input: {
  locale: string;
  category?: string | null;
  skip?: number;
  take: number;
  /** Der Aufmacher steht oben gesondert und soll nicht doppelt erscheinen. */
  excludeIds?: string[];
}): Promise<{ posts: BlogCard[]; total: number }> {
  const where = {
    ...publicPostWhere(),
    locale: input.locale,
    ...(input.category ? { category: input.category } : {}),
    ...(input.excludeIds?.length ? { id: { notIn: input.excludeIds } } : {}),
  };
  const [posts, total] = await Promise.all([
    prisma.platformPost.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: input.skip ?? 0,
      take: input.take,
      select: CARD_FIELDS,
    }),
    prisma.platformPost.count({ where }),
  ]);
  return { posts, total };
}

/** Der Aufmacher — oder der neueste Beitrag, wenn keiner gesetzt ist. */
export async function featuredPost(locale: string): Promise<BlogCard | null> {
  const flagged = await prisma.platformPost.findFirst({
    where: { ...publicPostWhere(), locale, isFeatured: true },
    orderBy: { publishedAt: "desc" },
    select: CARD_FIELDS,
  });
  if (flagged) return flagged;
  return prisma.platformPost.findFirst({
    where: { ...publicPostWhere(), locale },
    orderBy: { publishedAt: "desc" },
    select: CARD_FIELDS,
  });
}

/** Welche Rubriken in dieser Sprache tatsaechlich belegt sind. */
export async function usedCategories(locale: string): Promise<Set<string>> {
  const rows = await prisma.platformPost.groupBy({
    by: ["category"],
    where: { ...publicPostWhere(), locale, category: { not: null } },
  });
  return new Set(rows.map((row) => row.category).filter((value): value is string => Boolean(value)));
}

/**
 * Ein Beitrag anhand seiner Adresse.
 *
 * Die Adresse ist nur je Sprache eindeutig — derselbe Beitrag kann auf Deutsch
 * und Englisch „was-neu-ist" heissen. Deshalb gewinnt die Sprache des
 * Besuchers, bevor irgendeine andere genommen wird.
 *
 * `includeUnpublished` gibt es fuer die Vorschau: ein Plattform-Admin soll
 * einen Entwurf ansehen koennen, ohne ihn dafuer veroeffentlichen zu muessen.
 * Wer das darf, entscheidet die aufrufende Seite, nicht diese Funktion.
 */
export async function findPostBySlug(input: {
  slug: string;
  locale: string;
  includeUnpublished?: boolean;
}) {
  const visible = input.includeUnpublished ? {} : publicPostWhere();
  const candidates = await prisma.platformPost.findMany({
    where: { ...visible, slug: input.slug },
    include: { author: { select: { name: true, avatarUrl: true } } },
  });
  if (candidates.length === 0) return null;
  for (const locale of localeChain(input.locale)) {
    const match = candidates.find((post) => post.locale === locale);
    if (match) return match;
  }
  return candidates[0] ?? null;
}

/** Weiterlesen: neuere und aeltere Beitraege, Rubrik zuerst. */
export async function relatedPosts(input: {
  locale: string;
  excludeId: string;
  category: string | null;
  take: number;
}): Promise<BlogCard[]> {
  const base = { ...publicPostWhere(), locale: input.locale, id: { not: input.excludeId } };
  const sameCategory = input.category
    ? await prisma.platformPost.findMany({
        where: { ...base, category: input.category },
        orderBy: { publishedAt: "desc" },
        take: input.take,
        select: CARD_FIELDS,
      })
    : [];
  if (sameCategory.length >= input.take) return sameCategory;

  // Aufgefuellt wird mit den neuesten uebrigen — eine kurze Liste, die halb
  // leer ist, sieht aus, als sei etwas kaputt.
  const rest = await prisma.platformPost.findMany({
    where: { ...base, id: { notIn: [input.excludeId, ...sameCategory.map((post) => post.id)] } },
    orderBy: { publishedAt: "desc" },
    take: input.take - sameCategory.length,
    select: CARD_FIELDS,
  });
  return [...sameCategory, ...rest];
}
