import "server-only";
import { getTranslations } from "next-intl/server";
import prisma from "./prisma";
import { ALL_NAV_ITEMS, spaceTypeIcon } from "./dashboard-nav-items";
import type { IconName } from "@/components/dashboard/icons";

/**
 * Suche ueber alles, was im Creator-Dashboard steht.
 *
 * Bewusst breit: wer im Kopfbereich sucht, weiss meist nur noch den Namen —
 * ob das Gesuchte ein Space, ein Beitrag, ein Produkt oder eine Kampagne war,
 * ist genau die Information, die fehlt. Deshalb wird ueber alle Bereiche
 * parallel gesucht und nach Bereich gruppiert zurueckgegeben.
 *
 * Alle Abfragen laufen ueber den tenant-gescopten Client und filtern
 * zusaetzlich explizit auf tenantId — RLS ist die Absicherung, der Filter ist
 * die Absicht.
 */

export const MIN_QUERY = 2;
/** Pro Bereich; die Oberflaeche zeigt ohnehin nur die ersten Treffer. */
const PER_GROUP = 5;

export type DashboardSearchGroup =
  | "pages"
  | "spaces"
  | "members"
  | "posts"
  | "products"
  | "courses"
  | "lessons"
  | "events"
  | "tiers"
  | "newsletter"
  | "knowledge"
  | "media"
  | "live"
  | "badges";

export interface DashboardSearchHit {
  id: string;
  group: DashboardSearchGroup;
  icon: IconName;
  title: string;
  /** Zweite Zeile: E-Mail, Space-Name, Preis — was den Treffer eindeutig macht. */
  subtitle: string | null;
  href: string;
}

export interface DashboardSearchResult {
  query: string;
  total: number;
  groups: { group: DashboardSearchGroup; hits: DashboardSearchHit[] }[];
}

/** Reihenfolge der Bereiche im Popover — Naheliegendes zuerst. */
const GROUP_ORDER: DashboardSearchGroup[] = [
  "pages",
  "spaces",
  "members",
  "posts",
  "products",
  "courses",
  "lessons",
  "events",
  "tiers",
  "newsletter",
  "knowledge",
  "media",
  "live",
  "badges",
];

function clean(text: string | null | undefined, max = 90): string | null {
  if (!text) return null;
  const flat = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Die Bereiche des Dashboards selbst. Sucht auf den uebersetzten Labels, damit
 * "Einstellungen" genauso trifft wie "settings" — der Nutzer sieht ja nur das
 * uebersetzte Wort.
 */
async function searchPages(slug: string, term: string): Promise<DashboardSearchHit[]> {
  const t = await getTranslations("dashboard.nav");
  const needle = term.toLowerCase();
  return ALL_NAV_ITEMS.filter((it) => {
    const label = t(it.labelKey).toLowerCase();
    return label.includes(needle) || it.labelKey.toLowerCase().includes(needle);
  })
    .slice(0, PER_GROUP)
    .map((it) => ({
      id: `page:${it.href || "overview"}`,
      group: "pages" as const,
      icon: it.icon,
      title: t(it.labelKey),
      subtitle: null,
      href: `/dashboard/${slug}${it.href}`,
    }));
}

export async function searchDashboard(
  tenantId: string,
  slug: string,
  rawQuery: string,
): Promise<DashboardSearchResult> {
  const query = rawQuery.trim().slice(0, 80);
  if (query.length < MIN_QUERY) {
    return { query, total: 0, groups: [] };
  }

  const base = `/dashboard/${slug}`;
  const contains = { contains: query, mode: "insensitive" as const };
  const scope = { tenantId };

  // Rohe Enum-Werte ("SENT") gehoeren nicht in die Oberflaeche — die Labels
  // gibt es bereits dort, wo die Bereiche selbst gepflegt werden.
  const [tCampaign, tLive] = await Promise.all([
    getTranslations("dashboard.newsletter.status"),
    getTranslations("dashboard.live.status"),
  ]);

  const [
    pages,
    spaces,
    members,
    posts,
    products,
    courses,
    lessons,
    events,
    tiers,
    campaigns,
    articles,
    packages,
    live,
    badges,
  ] = await Promise.all([
    searchPages(slug, query),
    prisma.space.findMany({
      where: { ...scope, isArchived: false, OR: [{ name: contains }, { description: contains }] },
      take: PER_GROUP,
      select: { id: true, name: true, slug: true, type: true, description: true },
    }),
    prisma.membership.findMany({
      where: { ...scope, user: { OR: [{ name: contains }, { email: contains }] } },
      take: PER_GROUP,
      select: { id: true, user: { select: { name: true, email: true } } },
    }),
    prisma.post.findMany({
      where: { ...scope, OR: [{ title: contains }, { body: contains }] },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
      select: { id: true, title: true, body: true, space: { select: { name: true, slug: true } } },
    }),
    prisma.product.findMany({
      where: { ...scope, OR: [{ name: contains }, { description: contains }] },
      take: PER_GROUP,
      select: { id: true, name: true, description: true },
    }),
    prisma.course.findMany({
      where: { ...scope, OR: [{ title: contains }, { description: contains }] },
      take: PER_GROUP,
      select: { id: true, title: true, description: true, space: { select: { name: true, slug: true } } },
    }),
    prisma.lesson.findMany({
      where: { ...scope, OR: [{ title: contains }, { content: contains }] },
      take: PER_GROUP,
      select: {
        id: true,
        title: true,
        course: { select: { title: true, space: { select: { slug: true } } } },
      },
    }),
    prisma.event.findMany({
      where: { ...scope, OR: [{ title: contains }, { description: contains }, { location: contains }] },
      orderBy: { startsAt: "desc" },
      take: PER_GROUP,
      select: { id: true, title: true, location: true, space: { select: { name: true, slug: true } } },
    }),
    prisma.membershipTier.findMany({
      where: { ...scope, OR: [{ name: contains }, { description: contains }] },
      take: PER_GROUP,
      select: { id: true, name: true, description: true },
    }),
    prisma.newsletterCampaign.findMany({
      where: { ...scope, OR: [{ subject: contains }, { body: contains }] },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
      select: { id: true, subject: true, status: true },
    }),
    prisma.knowledgeArticle.findMany({
      where: { ...scope, OR: [{ title: contains }, { body: contains }] },
      take: PER_GROUP,
      select: { id: true, title: true, space: { select: { name: true, slug: true } } },
    }),
    prisma.mediaPackage.findMany({
      where: { ...scope, OR: [{ title: contains }, { description: contains }] },
      take: PER_GROUP,
      select: { id: true, title: true, description: true, space: { select: { name: true, slug: true } } },
    }),
    prisma.liveSession.findMany({
      where: { ...scope, title: contains },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
      select: { id: true, title: true, status: true, space: { select: { slug: true } } },
    }),
    prisma.badge.findMany({
      where: { ...scope, OR: [{ name: contains }, { description: contains }] },
      take: PER_GROUP,
      select: { id: true, name: true, description: true },
    }),
  ]);

  const spaceHref = (spaceSlug: string | undefined) =>
    spaceSlug ? `${base}/spaces/${spaceSlug}` : `${base}/spaces`;

  const hits: DashboardSearchHit[] = [
    ...pages,
    ...spaces.map((s) => ({
      id: s.id,
      group: "spaces" as const,
      icon: spaceTypeIcon(s.type),
      title: s.name,
      subtitle: clean(s.description),
      href: `${base}/spaces/${s.slug}`,
    })),
    ...members.map((m) => ({
      id: m.id,
      group: "members" as const,
      icon: "members" as IconName,
      title: m.user.name,
      subtitle: m.user.email,
      href: `${base}/members?q=${encodeURIComponent(m.user.email)}`,
    })),
    ...posts.map((p) => ({
      id: p.id,
      group: "posts" as const,
      icon: "feed" as IconName,
      title: clean(p.title, 70) ?? clean(p.body, 70) ?? "—",
      subtitle: p.space?.name ?? null,
      href: spaceHref(p.space?.slug),
    })),
    ...products.map((p) => ({
      id: p.id,
      group: "products" as const,
      icon: "products" as IconName,
      title: p.name,
      subtitle: clean(p.description),
      href: `${base}/products`,
    })),
    ...courses.map((c) => ({
      id: c.id,
      group: "courses" as const,
      icon: "courses" as IconName,
      title: c.title,
      subtitle: c.space?.name ?? clean(c.description),
      href: spaceHref(c.space?.slug),
    })),
    ...lessons.map((l) => ({
      id: l.id,
      group: "lessons" as const,
      icon: "play" as IconName,
      title: l.title,
      subtitle: l.course?.title ?? null,
      href: spaceHref(l.course?.space?.slug),
    })),
    ...events.map((e) => ({
      id: e.id,
      group: "events" as const,
      icon: "events" as IconName,
      title: e.title,
      subtitle: e.location ?? e.space?.name ?? null,
      href: spaceHref(e.space?.slug),
    })),
    ...tiers.map((t) => ({
      id: t.id,
      group: "tiers" as const,
      icon: "tiers" as IconName,
      title: t.name,
      subtitle: clean(t.description),
      href: `${base}/tiers`,
    })),
    ...campaigns.map((c) => ({
      id: c.id,
      group: "newsletter" as const,
      icon: "newsletter" as IconName,
      title: c.subject,
      subtitle: tCampaign.has(c.status) ? tCampaign(c.status) : null,
      href: `${base}/newsletter`,
    })),
    ...articles.map((a) => ({
      id: a.id,
      group: "knowledge" as const,
      icon: "knowledge" as IconName,
      title: a.title,
      subtitle: a.space?.name ?? null,
      href: spaceHref(a.space?.slug),
    })),
    ...packages.map((m) => ({
      id: m.id,
      group: "media" as const,
      icon: "gallery" as IconName,
      title: m.title,
      subtitle: m.space?.name ?? clean(m.description),
      href: spaceHref(m.space?.slug),
    })),
    ...live.map((l) => ({
      id: l.id,
      group: "live" as const,
      icon: "videos" as IconName,
      title: l.title,
      subtitle: tLive.has(l.status) ? tLive(l.status) : null,
      href: spaceHref(l.space?.slug),
    })),
    ...badges.map((b) => ({
      id: b.id,
      group: "badges" as const,
      icon: "medal" as IconName,
      title: b.name,
      subtitle: clean(b.description),
      href: `${base}/gamification`,
    })),
  ];

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    hits: hits.filter((h) => h.group === group),
  })).filter((g) => g.hits.length > 0);

  return { query, total: hits.length, groups: grouped };
}
