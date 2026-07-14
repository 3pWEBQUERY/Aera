import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { getCommunityCoverUrl } from "@/lib/tenant";
import { isAnnouncementsOnly, activeSpaceAds } from "@/lib/space-settings";
import { AdsBanner, type AdBannerItem } from "@/components/community/ads-banner";
import { canAccess } from "@/lib/entitlements";
import { displayRecommendations } from "@/lib/ai";
import { leaderboard } from "@/lib/gamification";
import { excerpt, formatPrice, timeAgo } from "@/lib/utils";
import { PostTile, type PostTileData } from "@/components/community/post-tile";
import { PostSlider } from "@/components/community/post-slider";
import { VideoSlider } from "@/components/community/video-slider";
import { MediaSlider } from "@/components/community/media-slider";
import { SpaceSectionPreview } from "@/components/community/space-section-preview";
import type { MediaTileData } from "@/components/community/media-tile";
import { SpaceSlider, type SpaceCardData } from "@/components/community/space-slider";
import { ShopSection, type ShopProduct, type ShopNotice } from "@/components/community/shop-section";
import { HeroActions } from "@/components/community/hero-actions";
import { parseLayout, orderedSections, audienceFor, type SectionType } from "@/lib/layout";
import { readPreviewOverride } from "@/lib/preview";
import { SocialGlyph, SOCIAL_BY_KEY } from "@/components/dashboard/social-icons";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Icon, type IconName } from "@/components/dashboard/icons";

const typeIcon: Record<string, IconName> = {
  FEED: "feed",
  FORUM: "forum",
  COURSE: "courses",
  SHOP: "products",
  NEWSLETTER: "newsletter",
  EVENTS: "events",
  BLOG: "blog",
  KNOWLEDGE: "knowledge",
  GALLERY: "gallery",
  VIDEOS: "videos",
  CHAT: "chat",
  PODCAST: "podcast",
  LINKS: "link",
  LIVE: "videos",
  REQUESTS: "messages",
  BOOKING: "clock",
  STORIES: "sparkles",
  TIPS: "heart",
  CALENDAR: "events",
};
// Icon shown on each recommendation, keyed by the type key from lib/ai
// (product · post · event · course).
const recTypeIcon: Record<string, IconName> = {
  product: "products",
  post: "feed",
  event: "events",
  course: "courses",
};

// Medal accent for the top three leaderboard ranks — restrained, not garish.
const rankMedal: Record<number, { ring: string; bg: string; text: string }> = {
  0: { ring: "ring-amber-300", bg: "bg-amber-50", text: "text-amber-600" },
  1: { ring: "ring-slate-300", bg: "bg-slate-100", text: "text-slate-500" },
  2: { ring: "ring-orange-300/70", bg: "bg-orange-50", text: "text-orange-700" },
};

export default async function CommunityHome({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, user, ctx } = community;
  const isMember = ctx.membership?.status === "ACTIVE";
  const t = await getTranslations("community.render.home");
  const tTypes = await getTranslations("community.render.spaceTypes");
  const tRec = await getTranslations("community.render.recTypes");
  const tReason = await getTranslations("community.render.recReason");
  const tPostTile = await getTranslations("community.render.postTile");
  const locale = await getLocale();

  const [spacesAll, coverUrl, memberCount, postCount, cheapestPaidTier] =
    await Promise.all([
      prisma.space.findMany({
        where: { tenantId: tenant.id, isArchived: false },
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { posts: true } } },
      }),
      getCommunityCoverUrl(tenant.id),
      prisma.membership.count({ where: { tenantId: tenant.id, status: "ACTIVE" } }),
      prisma.post.count({ where: { tenantId: tenant.id, isPublished: true } }),
      prisma.membershipTier.findFirst({
        where: { tenantId: tenant.id, priceCents: { gt: 0 } },
        orderBy: { priceCents: "asc" },
        select: { priceCents: true, currency: true, interval: true },
      }),
    ]);

  // Banner-only and ad spaces are invisible in the space lists; ads render
  // through their own layout section instead.
  const spaces = spacesAll.filter(
    (s) => s.type !== "ADS" && !isAnnouncementsOnly(s.settings),
  );
  const adSpaces = spacesAll.filter((s) => s.type === "ADS" && !s.isArchived);

  // Articles = feed/forum/blog. Video/podcast spaces are shown separately.
  const ARTICLE_TYPES = ["FEED", "FORUM", "BLOG"];
  const contentSpaces = spaces.filter((s) =>
    [...ARTICLE_TYPES, "VIDEOS", "PODCAST"].includes(s.type),
  );
  const lockedSpaceIds = new Set(
    contentSpaces.filter((s) => !canAccess(s, ctx)).map((s) => s.id),
  );
  const articleSpaceIds = contentSpaces
    .filter((s) => ARTICLE_TYPES.includes(s.type))
    .map((s) => s.id);
  const videoSpaceIds = contentSpaces
    .filter((s) => s.type === "VIDEOS")
    .map((s) => s.id);
  const podcastSpaces = contentSpaces.filter((s) => s.type === "PODCAST");
  const podcastSpaceIds = podcastSpaces.map((s) => s.id);

  const postInclude = {
    space: { select: { slug: true } },
    _count: { select: { comments: true, reactions: true } },
  } as const;

  const [recentRaw, popularRaw, videosRaw, episodesRaw] = await Promise.all([
    articleSpaceIds.length
      ? prisma.post.findMany({
          where: { tenantId: tenant.id, spaceId: { in: articleSpaceIds }, isPublished: true },
          orderBy: [{ isPinned: "desc" as const }, { createdAt: "desc" as const }],
          take: 8,
          include: postInclude,
        })
      : Promise.resolve([]),
    articleSpaceIds.length
      ? prisma.post.findMany({
          where: { tenantId: tenant.id, spaceId: { in: articleSpaceIds }, isPublished: true },
          orderBy: { reactions: { _count: "desc" as const } },
          take: 3,
          include: postInclude,
        })
      : Promise.resolve([]),
    videoSpaceIds.length
      ? prisma.post.findMany({
          where: { tenantId: tenant.id, spaceId: { in: videoSpaceIds }, isPublished: true },
          orderBy: [{ isPinned: "desc" as const }, { createdAt: "desc" as const }],
          take: 6,
          include: postInclude,
        })
      : Promise.resolve([]),
    podcastSpaceIds.length
      ? prisma.post.findMany({
          where: { tenantId: tenant.id, spaceId: { in: podcastSpaceIds }, isPublished: true },
          orderBy: [{ isPinned: "desc" as const }, { createdAt: "desc" as const }],
          take: 3,
          include: postInclude,
        })
      : Promise.resolve([]),
  ]);

  const toTile = (p: (typeof recentRaw)[number]): PostTileData & { body: string } => {
    const locked = lockedSpaceIds.has(p.spaceId);
    return {
      id: p.id,
      title: p.title || excerpt(p.body, 80) || t("untitled"),
      href: locked ? `/c/${slug}/join` : `/c/${slug}/s/${p.space.slug}/${p.id}`,
      imageUrl: locked ? null : p.imageUrl,
      videoUrl: locked ? null : p.videoUrl,
      hasVideo: Boolean(p.videoUrl),
      locked,
      createdAt: p.createdAt,
      likes: p._count.reactions,
      comments: p._count.comments,
      body: locked ? "" : p.body,
    };
  };

  const recent = recentRaw.map(toTile);
  const recentIds = new Set(recent.map((p) => p.id));
  const popular = popularRaw
    .map(toTile)
    .filter((p) => p.likes > 0 && !recentIds.has(p.id));
  const videos = videosRaw.map(toTile);
  const episodes = episodesRaw.map(toTile);
  const podcastHref = podcastSpaces[0]
    ? `/c/${slug}/s/${podcastSpaces[0].slug}`
    : null;

  // ----------------------------------------- Gallery image/media packages
  const gallerySpaces = spaces.filter((s) => s.type === "GALLERY");
  const galleryPkgRaw = gallerySpaces.length
    ? await prisma.mediaPackage.findMany({
        where: {
          tenantId: tenant.id,
          spaceId: { in: gallerySpaces.map((s) => s.id) },
          isPublished: true,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { _count: { select: { items: true } }, items: { select: { type: true } } },
      })
    : [];
  const gallerySpaceById = new Map(gallerySpaces.map((s) => [s.id, s]));
  const mediaPackages: MediaTileData[] = galleryPkgRaw.map((p) => {
    const space = gallerySpaceById.get(p.spaceId)!;
    const spaceLocked = !canAccess(space, ctx);
    const owned = p.priceCents === 0 || ctx.keys.has(p.entitlementKey);
    return {
      id: p.id,
      title: p.title,
      href: spaceLocked
        ? `/c/${slug}/join`
        : `/c/${slug}/s/${space.slug}?open=${p.id}`,
      coverUrl: spaceLocked ? null : p.coverUrl,
      itemCount: p._count.items,
      imageCount: p.items.filter((i) => i.type === "IMAGE").length,
      videoCount: p.items.filter((i) => i.type === "VIDEO").length,
      priceCents: p.priceCents,
      currency: p.currency,
      spaceLocked,
      owned,
    };
  });

  const [recs, board, shopProductsRaw, ownedOrders] = await Promise.all([
    isMember && user
      ? displayRecommendations(tenant.id, user.id, slug, 5, locale)
      : Promise.resolve([]),
    leaderboard(tenant.id, 5),
    // Tenant-wide catalogue (spaceId null) plus items assigned to shop spaces,
    // mirroring the SHOP space page. Newest first, capped for the home preview.
    prisma.product.findMany({
      where: { tenantId: tenant.id, isPublished: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    user
      ? prisma.order.findMany({
          where: { tenantId: tenant.id, userId: user.id, status: "PAID" },
          select: { productId: true },
        })
      : Promise.resolve([] as { productId: string | null }[]),
  ]);

  const nf = new Intl.NumberFormat(locale);

  // ---------------------------------------------------------------- Shop data
  const shopProducts: ShopProduct[] = shopProductsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    coverUrl: p.coverUrl,
    images: p.images,
    priceCents: p.priceCents,
    type: p.type,
    requiresShipping: p.requiresShipping,
    freeShipping: p.freeShipping,
    shippingCents: p.shippingCents,
    stock: p.stock,
    downloadUrl: p.downloadUrl,
  }));
  const ownedProductIds = ownedOrders
    .map((o) => o.productId)
    .filter((id): id is string => id !== null);
  const shopSpace = spaces.find((s) => s.type === "SHOP");
  const shopHref = shopSpace ? `/c/${slug}/s/${shopSpace.slug}` : null;

  // Purchase feedback from the checkout / server-action redirect.
  const productName = (id?: string) =>
    shopProducts.find((p) => p.id === id)?.name ?? null;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const errorMessages: Record<string, string> = {
    checkout: t("errCheckout"),
    "payments-unavailable": t("errPaymentsUnavailable"),
  };
  const shopNotice: ShopNotice = first(sp.purchased)
    ? { kind: "purchased", name: productName(first(sp.purchased)) }
    : first(sp.soldout)
      ? { kind: "soldout", name: productName(first(sp.soldout)) }
      : first(sp.error) && errorMessages[first(sp.error)!]
        ? { kind: "error", message: errorMessages[first(sp.error)!] }
        : null;
  const showUpsell = !!cheapestPaidTier && !ctx.hasPaidEntitlement && !ctx.isStaff;

  // Serializable card data for the "Entdecken" slider (client component).
  const spaceCards: SpaceCardData[] = spaces.map((s) => {
    const posts = s._count.posts;
    return {
      slug: s.slug,
      name: s.name,
      icon: typeIcon[s.type] ?? "spaces",
      // Big serif word on the tile = the category, like the landing marquee.
      category: tTypes.has(s.type) ? tTypes(s.type) : s.type,
      meta: `${s.name}${posts > 0 ? ` · ${t("postsCount", { count: nf.format(posts) })}` : ""}`,
      locked: !canAccess(s, ctx),
    };
  });

  // Page-builder config: which home sections show and in what order.
  // Live preview override (staff only, while editing) beats the saved layout.
  const preview = await readPreviewOverride(slug, ctx.isStaff);
  const layoutConfig = preview
    ? preview.config
    : parseLayout((tenant as unknown as { layout?: unknown }).layout ?? null);
  // Different viewer rights → different page view. In preview, the editor picks.
  const audience =
    preview?.audience ?? audienceFor(isMember, ctx.isStaff || ctx.hasPaidEntitlement);
  const sectionList = orderedSections(layoutConfig, audience);
  const displayName = preview?.name ?? tenant.name;

  const recentSection =
    recent.length === 0 ? (
      <section>
        <h2 className="display-serif mb-4 text-2xl text-[#161613]">{t("newPosts")}</h2>
        <EmptyState
          icon="feed"
          title={t("noPostsTitle")}
          hint={isMember ? t("noPostsHintMember") : t("noPostsHintGuest")}
        >
          {!isMember && (
            <ButtonLink href={`/c/${slug}/join`} size="sm">
              {t("joinNow")}
            </ButtonLink>
          )}
        </EmptyState>
      </section>
    ) : (
      <PostSlider title={t("newPosts")} items={recent} />
    );

  const popularSection =
    popular.length > 0 ? (
      <section>
        <h2 className="display-serif mb-4 text-2xl text-[#161613]">{t("popularPosts")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {popular.map((p) => (
            <PostTile key={p.id} post={p} locale={locale} memberLabel={tPostTile("becomeMember")} />
          ))}
        </div>
      </section>
    ) : null;

  const shopSectionEl = (
    <ShopSection
      slug={slug}
      products={shopProducts}
      ownedIds={ownedProductIds}
      shopHref={shopHref}
      notice={shopNotice}
    />
  );

  const videosSection = <VideoSlider title={t("videos")} items={videos} />;

  // Creator-run ad banners, collected across all ADS spaces (rotation order =
  // curated order within each space).
  const adItems: AdBannerItem[] = adSpaces
    .flatMap((s) => activeSpaceAds(s.settings))
    .map((a) => ({
      id: a.id,
      title: a.title,
      mediaUrl: a.mediaUrl,
      mediaType: a.mediaType,
      targetUrl: a.targetUrl,
      durationSec: a.durationSec,
    }));
  const adsSection = adItems.length > 0 ? <AdsBanner ads={adItems} /> : null;

  const podcastSection =
    episodes.length > 0 ? (
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="display-serif text-2xl text-[#161613]">{t("podcast")}</h2>
          {podcastHref && (
            <Link
              href={podcastHref}
              className="inline-flex items-center gap-1 text-sm font-semibold text-[#161613]/70 transition-colors hover:gap-1.5 hover:text-[#161613]"
            >
              {t("allEpisodes")}
              <Icon name="arrowRight" size={15} />
            </Link>
          )}
        </div>
        <div className="space-y-4">
          {episodes.map((p) => (
            <article
              key={p.id}
              className="rounded-2xl border border-[#161613]/10 bg-white p-5 sm:p-6"
            >
              <div className="flex items-start gap-4 sm:gap-5">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20"
                  />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[color:var(--brand)] sm:h-20 sm:w-20">
                    <Icon name="podcast" size={26} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/45">
                    {t("episode")} · {timeAgo(p.createdAt, locale)}
                  </p>
                  <h3 className="display-serif mt-1 text-xl leading-snug text-[#161613] sm:text-2xl">
                    {p.title}
                  </h3>
                  {p.body && (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#161613]/60">
                      {excerpt(p.body, 200)}
                    </p>
                  )}
                </div>
              </div>
              {p.locked ? (
                <Link
                  href={`/c/${slug}/join`}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-hover)]"
                >
                  <Icon name="lock" size={14} />
                  {t("listenWithMembership")}
                </Link>
              ) : (
                p.videoUrl && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio
                    src={p.videoUrl}
                    controls
                    preload="metadata"
                    className="mt-4 w-full"
                  />
                )
              )}
            </article>
          ))}
        </div>
      </section>
    ) : null;
  const imagesSection = <MediaSlider title={t("images")} items={mediaPackages} />;
  const spacesSection = <SpaceSlider title={t("discover")} slug={slug} items={spaceCards} />;

  const recsSection =
    recs.length > 0 ? (
      <div className="overflow-hidden rounded-2xl border border-[#161613]/10 bg-white">
        <div className="flex items-center gap-3 border-b border-[#161613]/10 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[color:var(--brand)]">
            <Icon name="sparkles" size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="display-serif text-xl text-[#161613]">{t("recsTitle")}</h2>
            <p className="text-xs text-[#161613]/50">{t("recsSubtitle")}</p>
          </div>
        </div>
        <ul className="divide-y divide-[#161613]/10">
          {recs.map((r, i) => (
            <li key={i}>
              <a
                href={r.href}
                className="group flex items-center gap-3 px-5 py-3 outline-none transition-colors hover:bg-[#161613]/[0.03] focus-visible:bg-[#161613]/[0.03]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#161613]/5 text-[#161613]/50 transition-colors group-hover:bg-[var(--brand-soft)] group-hover:text-[color:var(--brand)]">
                  <Icon name={recTypeIcon[r.type] ?? "sparkles"} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center rounded-full bg-[#161613]/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#161613]/55">
                    {tRec.has(r.type) ? tRec(r.type) : r.type}
                  </span>
                  <p className="mt-1 truncate text-sm font-semibold text-[#161613]">{r.title}</p>
                  <p className="truncate text-xs text-[#161613]/50">
                    {tReason.has(r.reason) ? tReason(r.reason) : r.reason}
                  </p>
                </div>
                <Icon
                  name="chevron"
                  size={16}
                  className="-rotate-90 shrink-0 text-[#161613]/25 transition-all group-hover:translate-x-0.5 group-hover:text-[#161613]"
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const leaderboardSection = (
    <div className="overflow-hidden rounded-2xl border border-[#161613]/10 bg-white">
      <div className="flex items-center gap-3 border-b border-[#161613]/10 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[color:var(--brand)]">
          <Icon name="trophy" size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="display-serif text-xl text-[#161613]">{t("leaderboardTitle")}</h2>
          <p className="text-xs text-[#161613]/50">{t("leaderboardSubtitle")}</p>
        </div>
      </div>
      {board.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[#161613]/50">{t("noPoints")}</p>
      ) : (
        <ol className="divide-y divide-[#161613]/10">
          {board.map((row, i) => {
            const medal = rankMedal[i];
            return (
              <li key={row.userId} className="flex items-center gap-3 px-5 py-2.5">
                <span
                  className={
                    medal
                      ? `flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ${medal.bg} ${medal.text} ${medal.ring}`
                      : "display-serif flex h-6 w-6 shrink-0 items-center justify-center text-sm text-[#161613]/45"
                  }
                >
                  {i + 1}
                </span>
                <Avatar name={row.name} src={row.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#161613]">{row.name}</p>
                  {row.levelName && <p className="truncate text-xs text-[#161613]/45">{row.levelName}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-semibold text-[color:var(--brand)]">
                  {t("points", { count: nf.format(row.points) })}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="border-t border-[#161613]/10 px-5 py-3">
        <Link
          href={`/c/${slug}/leaderboard`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#161613]/70 transition-colors hover:gap-2.5 hover:text-[#161613]"
        >
          {t("viewLeaderboard")}
          <Icon name="arrowRight" size={15} />
        </Link>
      </div>
    </div>
  );

  const sectionMap: Record<Exclude<SectionType, "SPACE">, React.ReactNode> = {
    RECENT_POSTS: recentSection,
    POPULAR_POSTS: popularSection,
    SHOP: shopSectionEl,
    VIDEOS: videosSection,
    IMAGES: imagesSection,
    PODCAST: podcastSection,
    ADS: adsSection,
    SPACES: spacesSection,
    RECOMMENDATIONS: recsSection,
    LEADERBOARD: leaderboardSection,
  };

  // A single space featured as its own home-page section (page builder → SPACE).
  const spaceBySlug = new Map(spaces.map((s) => [s.slug, s]));
  function spaceSection(spaceSlug: string): React.ReactNode {
    const s = spaceBySlug.get(spaceSlug);
    if (!s) return null;
    return (
      <SpaceSectionPreview
        slug={slug}
        tenantId={tenant.id}
        space={{ id: s.id, slug: s.slug, name: s.name, type: s.type, description: s.description, settings: s.settings }}
        locked={!canAccess(s, ctx)}
        icon={typeIcon[s.type] ?? "spaces"}
        typeLabel={tTypes.has(s.type) ? tTypes(s.type) : s.type}
        locale={locale}
      />
    );
  }

  return (
    <div>
      {/* -------------------------------- Hero (framed cover, editorial) */}
      <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Titelbild als gerahmter Media-Block statt Vollbild mit Scrim. */}
        <div className="relative aspect-[5/2] w-full overflow-hidden rounded-3xl sm:aspect-[3/1]">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            /* Kein Cover: flache Markenfläche mit großer Serif-Initiale. */
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: tenant.primaryColor }}
            >
              <span
                aria-hidden
                className="display-serif select-none text-[clamp(96px,20vw,240px)] leading-none text-white/25"
              >
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Editorial-Kopf unter dem Bild: Text liegt auf der Seite. */}
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pb-2 pt-6 sm:pt-8">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/50">
              {t("postsCount", { count: nf.format(postCount) })}
              <span className="mx-1.5" aria-hidden>·</span>
              {t("membersCount", { count: memberCount })}
            </p>
            <h1 className="display-serif mt-2 text-4xl leading-[1.05] text-[#161613] sm:text-6xl">
              {displayName}
            </h1>
            {(tenant.tagline || tenant.description) && (
              <p className="mt-3 line-clamp-2 max-w-xl text-base leading-7 text-[#161613]/65">
                {tenant.tagline ?? tenant.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
            <HeroActions slug={slug} isMember={isMember} isStaff={ctx.isStaff} />

            {layoutConfig.header.socials.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5">
                {layoutConfig.header.socials.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={SOCIAL_BY_KEY[s.platform]?.label ?? "Link"}
                    title={SOCIAL_BY_KEY[s.platform]?.label ?? "Link"}
                    className="block overflow-hidden rounded-[11px] ring-1 ring-[#161613]/10 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/40"
                  >
                    <SocialGlyph platform={s.platform} size={40} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------ Paid-tier upsell (full-bleed) */}
      {showUpsell && (
        <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#161613] px-5 py-4 text-white sm:px-6">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {t("upsellTitle", { name: tenant.name })}
              </p>
              <p className="mt-0.5 text-sm text-white/70">
                {t("upsellFrom", {
                  price: formatPrice(cheapestPaidTier!.priceCents, cheapestPaidTier!.currency, locale),
                  interval:
                    cheapestPaidTier!.interval === "MONTH"
                      ? t("perMonth")
                      : cheapestPaidTier!.interval === "YEAR"
                        ? t("perYear")
                        : "",
                })}
              </p>
            </div>
            <ButtonLink
              href={`/c/${slug}/join`}
              size="sm"
              className="shrink-0 rounded-full"
            >
              {t("membershipOptions")}
            </ButtonLink>
          </div>
        </section>
      )}

      {/* ------------- Centered content column (order from page builder) */}
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6">
        {sectionList.map((sec) => {
          if (sec.type === "SPACE") {
            if (!sec.value) return null;
            return <div key={sec.id ?? `space-${sec.value}`}>{spaceSection(sec.value)}</div>;
          }
          return sectionMap[sec.type] ? (
            <div key={sec.type}>{sectionMap[sec.type]}</div>
          ) : null;
        })}
      </div>
    </div>
  );
}
