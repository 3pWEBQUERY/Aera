import Link from "next/link";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Icon } from "@/components/dashboard/icons";
import { CATEGORIES, categoryByKey, isValidCategory } from "@/lib/categories";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  CommunityCard,
  type CommunityCardData,
} from "@/components/home/community-card";
import {
  CreatorSlider,
  type SliderCreator,
} from "@/components/home/creator-slider";
import { CategoryChips } from "@/components/home/category-chips";
import { HScrollRow } from "@/components/community/h-scroll-row";

/** Poster palette — same muted tones as the landing-page marquee tiles. */
const CATEGORY_TILE_TONES = [
  "bg-[#ece7dc] text-[#161613]",
  "bg-[#21372b] text-[#ece7dc]",
  "bg-[#c8553a] text-[#f7f1e8]",
  "bg-[#1c1c19] text-[#ece7dc]",
  "bg-[#d8d1f0] text-[#241458]",
];

const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  logoUrl: true,
  primaryColor: true,
  accentColor: true,
  _count: { select: { memberships: true, posts: true } },
} as const;

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  _count: { memberships: number; posts: number };
};

/** Latest community-cover per tenant, resolved in a single query. */
async function coverMap(tenantIds: string[]): Promise<Map<string, string>> {
  if (tenantIds.length === 0) return new Map();
  const rows = await prisma.storageObject.findMany({
    where: { tenantId: { in: tenantIds }, purpose: "community-cover" },
    orderBy: { createdAt: "desc" },
    select: { tenantId: true, url: true },
  });
  const map = new Map<string, string>();
  for (const r of rows) if (!map.has(r.tenantId)) map.set(r.tenantId, r.url);
  return map;
}

function toCard(t: TenantRow, covers: Map<string, string>): CommunityCardData {
  return {
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    logoUrl: t.logoUrl,
    coverUrl: covers.get(t.id) ?? null,
    primaryColor: t.primaryColor,
    accentColor: t.accentColor,
    memberCount: t._count.memberships,
    postCount: t._count.posts,
  };
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      {hint && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/45">
          {hint}
        </p>
      )}
      <h2 className="display-serif mt-1 text-2xl text-[#161613]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CardGrid({ items }: { items: CommunityCardData[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((c) => (
        <CommunityCard key={c.slug} community={c} />
      ))}
    </div>
  );
}

/**
 * Categories that actually have communities (key → count). Gracefully returns
 * an empty map until the `Tenant.category` migration has been applied.
 */
async function categoriesInUse(): Promise<Map<string, number>> {
  try {
    const rows = (await prisma.tenant.groupBy({
      by: ["category"],
      _count: { _all: true },
      where: { category: { not: null }, status: "ACTIVE" },
    } as never)) as unknown as { category: string | null; _count: { _all: number } }[];
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.category && isValidCategory(r.category)) map.set(r.category, r._count._all);
    }
    return map;
  } catch {
    // Column not migrated yet — hide category UI instead of crashing.
    return new Map();
  }
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const { q, cat } = await searchParams;
  const query = (q ?? "").trim().slice(0, 80);
  const activeCat = cat && isValidCategory(cat) ? cat : null;
  const user = await getCurrentUser();
  const t = await getTranslations("discover");
  const tCat = await getTranslations("categories");

  // ------------------------------------------------------------- Search
  if (query) {
    const results = await prisma.tenant.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { tagline: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { memberships: { _count: "desc" } },
      take: 24,
      select: CARD_SELECT,
    });
    const covers = await coverMap(results.map((t) => t.id));

    return (
      <div className="w-full px-4 py-8 sm:px-8">
        <SearchBar defaultValue={query} />
        <div className="mt-8">
          <h1 className="display-serif text-2xl text-[#161613]">
            {results.length === 0
              ? t("noResults", { query })
              : t("resultsFor", { count: results.length, query })}
          </h1>
          {results.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[#161613]/25 px-6 py-12 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#161613]/5 text-[#161613]/40">
                <Icon name="search" size={24} />
              </span>
              <p className="mt-4 font-medium text-[#161613]">{t("emptyTitle")}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-[#161613]/60">
                {t("emptyText")}
              </p>
              <Link
                href="/start"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#161613] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#33332e]"
              >
                <Icon name="plus" size={16} /> {t("startCta")}
              </Link>
            </div>
          ) : (
            <div className="mt-5">
              <CardGrid
                items={results.map((t) => toCard(t as TenantRow, covers))}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------- Category view
  if (activeCat) {
    const category = categoryByKey(activeCat)!;
    const results = await prisma.tenant.findMany({
      where: { category: activeCat, status: "ACTIVE" } as unknown as Prisma.TenantWhereInput,
      orderBy: { memberships: { _count: "desc" } },
      take: 24,
      select: CARD_SELECT,
    });
    const covers = await coverMap(results.map((t) => t.id));

    return (
      <div className="w-full px-4 py-8 sm:px-8">
        <SearchBar />
        <CategoryChips active={activeCat} />
        <div className="mt-8">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: category.gradient[0] }}
            >
              <Icon name={category.icon} size={19} />
            </span>
            <div>
              <h1 className="display-serif text-2xl text-[#161613]">
                {tCat(category.key)}
              </h1>
              <p className="text-sm text-[#161613]/60">
                {t("communityCount", { count: results.length })}
              </p>
            </div>
          </div>
          <div className="mt-5">
            <CardGrid items={results.map((t) => toCard(t as TenantRow, covers))} />
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ Browse
  const [mine, popular, newest] = await Promise.all([
    user
      ? prisma.membership.findMany({
          where: {
            userId: user.id,
            status: "ACTIVE",
            tenant: { status: "ACTIVE" },
          },
          orderBy: { joinedAt: "desc" },
          take: 16,
          include: { tenant: { select: CARD_SELECT } },
        })
      : Promise.resolve([]),
    prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      orderBy: { memberships: { _count: "desc" } },
      take: 8,
      select: CARD_SELECT,
    }),
    prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: CARD_SELECT,
    }),
  ]);

  const mineTenants = mine.map((m) => m.tenant) as TenantRow[];
  const mineIds = new Set(mineTenants.map((t) => t.id));
  const popularClean = (popular as TenantRow[]).filter((t) => !mineIds.has(t.id));
  const popularIds = new Set(popularClean.map((t) => t.id));
  const newestClean = (newest as TenantRow[]).filter(
    (t) => !mineIds.has(t.id) && !popularIds.has(t.id),
  );

  const used = await categoriesInUse();

  // "Top-Kreative" slider per category (like the reference design).
  const usedCats = CATEGORIES.filter((c) => used.has(c.key));
  const catRows = await Promise.all(
    usedCats.map((c) =>
      prisma.tenant.findMany({
        where: { category: c.key, status: "ACTIVE" } as unknown as Prisma.TenantWhereInput,
        orderBy: { memberships: { _count: "desc" } },
        take: 12,
        select: CARD_SELECT,
      }),
    ),
  );

  const covers = await coverMap([
    ...mineTenants.map((t) => t.id),
    ...popularClean.map((t) => t.id),
    ...newestClean.map((t) => t.id),
    ...catRows.flat().map((t) => (t as TenantRow).id),
  ]);

  const toSlider = (t: TenantRow): SliderCreator => ({
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    logoUrl: t.logoUrl,
    coverUrl: covers.get(t.id) ?? null,
    primaryColor: t.primaryColor,
    accentColor: t.accentColor,
  });

  return (
    <div className="w-full space-y-10 px-4 py-8 sm:px-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/50">
          {t("eyebrow")}
        </p>
        <h1 className="display-serif mt-2 text-4xl text-[#161613] sm:text-5xl">
          {t("title")}
        </h1>
        <div className="mt-6">
          <SearchBar />
        </div>
        <CategoryChips active={null} />
      </div>

      {mineTenants.length > 0 && (
        <HScrollRow title={t("mineTitle")}>
          {mineTenants.map((tenant) => (
            <Link
              key={tenant.slug}
              href={`/c/${tenant.slug}`}
              className="group flex w-[260px] shrink-0 snap-start items-center gap-3.5 rounded-2xl border border-[#161613]/10 bg-white p-4 transition duration-300 hover:-translate-y-1 hover:border-[#161613]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25 sm:w-[280px]"
            >
              {tenant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
              ) : (
                <span
                  className="display-serif flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg text-white"
                  style={{ backgroundColor: tenant.primaryColor }}
                >
                  {tenant.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0">
                <span className="display-serif block truncate text-base leading-tight text-[#161613]">
                  {tenant.name}
                </span>
                <span className="mt-1 block truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[#161613]/45">
                  {t("memberCount", { count: tenant._count.memberships })}
                </span>
              </span>
            </Link>
          ))}
        </HScrollRow>
      )}

      {popularClean.length > 0 && (
        <Section title={t("popularTitle")} hint={t("popularHint")}>
          <CardGrid items={popularClean.map((row) => toCard(row, covers))} />
        </Section>
      )}

      {used.size > 0 && (
        <Section title={t("topicsTitle")}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {usedCats.map((c, i) => (
              <Link
                key={c.key}
                href={`/home?cat=${c.key}`}
                className={`group flex h-44 flex-col justify-between rounded-2xl p-5 transition-transform duration-300 hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/30 sm:h-48 ${CATEGORY_TILE_TONES[i % CATEGORY_TILE_TONES.length]}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-60">
                    {t("topicBadge")}
                  </span>
                  <Icon
                    name={c.icon}
                    size={18}
                    className="opacity-50 transition group-hover:opacity-90"
                  />
                </span>
                <span className="block min-w-0">
                  <span className="display-serif block truncate text-2xl leading-none sm:text-3xl">
                    {tCat(c.key)}
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium opacity-70">
                    {t("communityCount", { count: used.get(c.key) ?? 0 })}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Top creators per category — horizontal sliders. */}
      {usedCats.map((c, i) =>
        catRows[i].length > 0 ? (
          <CreatorSlider
            key={c.key}
            eyebrow={t("topEyebrow")}
            title={tCat(c.key)}
            href={`/home?cat=${c.key}`}
            items={catRows[i].map((row) => toSlider(row as TenantRow))}
          />
        ) : null,
      )}

      {newestClean.length > 0 && (
        <Section title={t("newestTitle")} hint={t("newestHint")}>
          <CardGrid items={newestClean.map((row) => toCard(row, covers))} />
        </Section>
      )}

      {/* Create-your-own banner instead of fake topic tiles. */}
      <section className="overflow-hidden rounded-2xl bg-[#161613] p-7 text-white sm:p-9">
        <h2 className="display-serif max-w-lg text-2xl leading-snug sm:text-3xl">
          {t("bannerTitleA")}
          <span className="text-white/55"> {t("bannerTitleB")}</span>
        </h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/65">
          {t("bannerText")}
        </p>
        <Link
          href="/start"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#161613] transition-colors hover:bg-[#ece7dc]"
        >
          <Icon name="plus" size={16} /> {t("startCta")}
        </Link>
      </section>
    </div>
  );
}

async function SearchBar({ defaultValue = "" }: { defaultValue?: string }) {
  const t = await getTranslations("discover");
  return (
    <form method="GET" action="/home" id="suche" className="max-w-2xl">
      <div className="flex items-center gap-3 rounded-full border border-[#161613]/20 bg-white py-2 pl-5 pr-2 transition focus-within:border-[#161613]/50 focus-within:ring-2 focus-within:ring-[#161613]/10">
        <Icon name="search" size={20} className="shrink-0 text-[#161613]/40" />
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={t("searchPlaceholder")}
          className="w-full bg-transparent py-2 text-base outline-none placeholder:text-[#161613]/40"
          aria-label={t("searchAria")}
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-[#161613] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#33332e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/30"
        >
          {t("searchSubmit")}
        </button>
      </div>
    </form>
  );
}
