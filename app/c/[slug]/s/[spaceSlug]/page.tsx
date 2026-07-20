import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { getPostSettingsForPosts } from "@/lib/post-settings";
import { CoverBanner } from "@/components/community/cover-banner";
import { canAccess } from "@/lib/entitlements";
import { isLessonUnlocked, daysUntilUnlock } from "@/lib/drip";
import { PostCard, type PostCardData } from "@/components/community/post-card";
import { PostComposer } from "@/components/community/post-composer";
import { VoteControl } from "@/components/community/vote-control";
import { GalleryFolders, type CPackage } from "@/components/community/gallery-folders";
import { BlogIndex, type BlogPost } from "@/components/community/blog-index";
import {
  parseKnowledgeSettings,
  parseBlogSettings,
  parseChatSettings,
  parseSpaceLinks,
  parseStorySettings,
  isAnnouncementsOnly,
} from "@/lib/space-settings";
import { Card, CardBody } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar, EmptyState, Pill } from "@/components/ui/misc";
import { cn, formatPrice, formatDateTime, timeAgo, excerpt } from "@/lib/utils";
import { Icon } from "@/components/dashboard/icons";
import { SpaceSidebar } from "@/components/community/space-sidebar";
import { ChatThread } from "@/components/community/chat/chat-thread";
import { ChatHub } from "@/components/community/chat/chat-hub";
import { LiveRoom } from "@/components/community/live-room";
import { StoryViewer } from "@/components/community/story-viewer";
import { groupStoriesByAuthor } from "@/lib/stories";
import { RequestVoteControl } from "@/components/community/request-vote-control";
import { listLiveSessions, getLiveSession, fetchRecentLiveMessages } from "@/lib/live";
import { ProductCarousel } from "@/components/community/product-carousel";
import { fetchSpaceMessages, listHubThreads, getDirectThread } from "@/lib/chat";
import {
  purchaseProductAction,
  purchasePostAction,
  rsvpEventAction,
  completeLessonAction,
} from "@/app/actions/engage";
import { PurchaseSubmitButton } from "@/components/community/purchase-submit-button";
import { ImmediateAccessConsent } from "@/components/community/immediate-access-consent";
import { submitRequestAction, purchaseRequestAction } from "@/app/actions/requests";
import { reserveBookingAction } from "@/app/actions/booking";
import { tipAction } from "@/app/actions/tips";
import { PLATFORM_CURRENCY } from "@/lib/currency";

const PRODUCT_TYPES = ["DIGITAL", "PHYSICAL", "BUNDLE", "COURSE_ACCESS", "TIER_GRANT"];
const productTypeKey = (type: string) => (PRODUCT_TYPES.includes(type) ? type : "DIGITAL");

export default async function SpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; spaceSlug: string }>;
  searchParams: Promise<{
    sort?: string;
    open?: string;
    purchased?: string;
    q?: string;
    page?: string;
    dm?: string;
    error?: string;
  }>;
}) {
  const { slug, spaceSlug } = await params;
  const { sort, open, purchased, q, page, dm, error } = await searchParams;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, user, ctx } = community;
  const t = await getTranslations("community.render.space");
  const tType = await getTranslations("community.render.spaceTypeSingular");
  const tPType = await getTranslations("community.render.productTypes");
  const tShop = await getTranslations("community.render.shop");
  const tLegal = await getTranslations("legalPurchase");
  const locale = await getLocale();

  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, slug: spaceSlug },
  });
  if (!space) notFound();
  // Banner-only and ad spaces have no public page (ads render on the home page).
  if (space.type === "ADS" || isAnnouncementsOnly(space.settings)) notFound();

  const allowed = canAccess(space, ctx);
  const isMember = ctx.membership?.status === "ACTIVE";

  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardBody className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)]">
              <Icon name="lock" size={26} className="text-[var(--brand)]" />
            </div>
            <h1 className="display-serif mt-3 text-2xl text-[#161613]">{space.name}</h1>
            <p className="mt-2 text-[#161613]/60">
              {space.visibility === "PAID" ? t("lockedDescPaid") : t("lockedDesc")}
            </p>
            <div className="mt-5">
              <ButtonLink href={`/c/${slug}/join`} variant="brand">
                {isMember ? t("upgradeMembership") : t("join")}
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const header = (
    <div className="mb-6">
      {error === "legal-consent" && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          {tLegal("requiredError")}
        </p>
      )}
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#161613]/45">
        {tType.has(space.type) ? tType(space.type) : tType("fallback")}
      </p>
      <h1 className="display-serif mt-1.5 text-3xl text-[#161613] sm:text-4xl">
        {space.name}
      </h1>
      {space.description && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#161613]/60">
          {space.description}
        </p>
      )}
    </div>
  );

  // ----- Link-Hub: curated links -----
  if (space.type === "LINKS") {
    const links = parseSpaceLinks(space.settings);
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        {links.length === 0 ? (
          <EmptyState
            icon="link"
            title={t("noLinks")}
            hint={t("noLinksHint")}
          />
        ) : (
          <div className="space-y-3">
            {links.map((l) => {
              const external = /^https?:\/\//i.test(l.url);
              return (
                <a
                  key={l.id}
                  href={l.url}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className="group flex items-center gap-4 rounded-2xl border border-[#161613]/10 bg-white p-5 transition duration-300 hover:-translate-y-0.5 hover:border-[#161613]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[color:var(--brand)]">
                    <Icon name="link" size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="display-serif block truncate text-lg leading-tight text-[#161613]">
                      {l.title}
                    </span>
                    {l.description ? (
                      <span className="mt-0.5 block truncate text-sm text-[#161613]/60">
                        {l.description}
                      </span>
                    ) : (
                      <span className="mt-0.5 block truncate text-sm text-[#161613]/45">
                        {l.url.replace(/^https?:\/\//i, "")}
                      </span>
                    )}
                  </span>
                  <Icon
                    name={external ? "external" : "chevron"}
                    size={17}
                    className={cn(
                      "shrink-0 text-[#161613]/30 transition group-hover:text-[#161613]",
                      !external && "-rotate-90",
                    )}
                  />
                </a>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ----- Forum (Reddit style) -----
  if (space.type === "FORUM") {
    const forumQuery = (q ?? "").trim().slice(0, 80);
    const rawPosts = await prisma.post.findMany({
      where: {
        tenantId: tenant.id,
        spaceId: space.id,
        isPublished: true,
        ...(forumQuery
          ? {
              OR: [
                { title: { contains: forumQuery, mode: "insensitive" as const } },
                { body: { contains: forumQuery, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        author: { select: { name: true, avatarUrl: true } },
        _count: { select: { comments: true } },
      },
    });
    const ids = rawPosts.map((p) => p.id);
    const forumSettings = await getPostSettingsForPosts(tenant.id, ids);
    const [voteGroups, myVotes] = await Promise.all([
      ids.length
        ? prisma.reaction.groupBy({
            by: ["postId", "type"],
            where: { tenantId: tenant.id, postId: { in: ids }, type: { in: ["UP", "DOWN"] } },
            _count: true,
          })
        : Promise.resolve([]),
      user && ids.length
        ? prisma.reaction.findMany({
            where: { tenantId: tenant.id, userId: user.id, postId: { in: ids }, type: { in: ["UP", "DOWN"] } },
            select: { postId: true, type: true },
          })
        : Promise.resolve([]),
    ]);
    const scoreMap: Record<string, number> = {};
    for (const g of voteGroups) {
      if (!g.postId) continue;
      scoreMap[g.postId] = (scoreMap[g.postId] ?? 0) + (g.type === "UP" ? 1 : -1) * (g._count as number);
    }
    const voteMap: Record<string, "UP" | "DOWN"> = {};
    for (const v of myVotes) if (v.postId) voteMap[v.postId] = v.type as "UP" | "DOWN";

    const list = [...rawPosts];
    if (sort === "new") {
      list.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.createdAt.getTime() - a.createdAt.getTime());
    } else {
      list.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || (scoreMap[b.id] ?? 0) - (scoreMap[a.id] ?? 0) || b.createdAt.getTime() - a.createdAt.getTime());
    }

    const tab = (key: string, label: string) => (
      <Link
        href={`/c/${slug}/s/${spaceSlug}${key === "top" ? "" : `?sort=${key}`}`}
        className={cn(
          "rounded-lg px-3 py-1.5 text-sm font-medium transition",
          (sort ?? "top") === key ? "bg-[#161613] text-white" : "text-[#161613]/60 hover:bg-[#161613]/5",
        )}
      >
        {label}
      </Link>
    );

    return (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
        {header}
        {isMember && !forumQuery && (
          <div className="mb-4">
            <PostComposer slug={slug} space={spaceSlug} withTitle />
          </div>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {tab("top", t("forumPopular"))}
          {tab("new", t("forumNew"))}
          {forumQuery && (
            <Link
              href={`/c/${slug}/s/${spaceSlug}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#161613]/10 bg-white px-3 py-1.5 text-sm font-medium text-[#161613]/70 transition hover:bg-[#161613]/[0.03]"
            >
              <Icon name="close" size={14} />
              {t("resetSearch", { q: forumQuery })}
            </Link>
          )}
        </div>
        {list.length === 0 ? (
          forumQuery ? (
            <EmptyState
              icon="search"
              title={t("noResultsTitle", { q: forumQuery })}
              hint={t("tryOtherTerm")}
            />
          ) : (
            <EmptyState icon="forum" title={t("noTopics")} hint={t("startDiscussion")} />
          )
        ) : (
          <div className="space-y-2.5">
            {list.map((p) => (
              <article key={p.id} className="flex gap-3 rounded-xl border border-[#161613]/10 bg-white p-3 transition hover:border-[#161613]/25">
                <VoteControl tenant={slug} space={spaceSlug} targetType="post" targetId={p.id} postId={p.id} score={scoreMap[p.id] ?? 0} myVote={voteMap[p.id] ?? null} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-[#161613]/50">
                    <Avatar name={p.author.name} src={p.author.avatarUrl} size={20} />
                    <span>{p.author.name}</span>
                    <span>· {timeAgo(p.createdAt, locale)}</span>
                    {p.isPinned && <Pill className="bg-amber-100 text-amber-700">{t("pinned")}</Pill>}
                  </div>
                  <Link href={`/c/${slug}/s/${spaceSlug}/${p.id}`}>
                    <h3 className="mt-1 font-semibold text-[#161613] hover:text-[color:var(--brand)]">
                      {p.title || excerpt(p.body, 80)}
                    </h3>
                  </Link>
                  {p.body && p.title && (
                    <p className={cn("mt-0.5 text-sm text-[#161613]/60", !forumSettings.get(p.id)?.disableTruncation && "line-clamp-2")}>
                      {forumSettings.get(p.id)?.disableTruncation ? p.body : excerpt(p.body, 160)}
                    </p>
                  )}
                  <Link href={`/c/${slug}/s/${spaceSlug}/${p.id}`} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#161613]/60 hover:text-[#161613]">
                    <Icon name="forum" size={14} /> {t("commentsCount", { count: p._count.comments })}
                  </Link>
                </div>
                {forumSettings.get(p.id)?.coverUrl && (
                  <Link href={`/c/${slug}/s/${spaceSlug}/${p.id}`} className="hidden shrink-0 self-center sm:block">
                    <CoverBanner
                      url={forumSettings.get(p.id)!.coverUrl!}
                      offsetX={forumSettings.get(p.id)!.coverOffsetX}
                      offsetY={forumSettings.get(p.id)!.coverOffsetY}
                      zoom={forumSettings.get(p.id)!.coverZoom}
                      aspect="16 / 10"
                      rounded="rounded-lg"
                      className="w-28 border border-[#161613]/10"
                    />
                  </Link>
                )}
              </article>
            ))}
          </div>
        )}
        </div>

        <SpaceSidebar
          tenantId={tenant.id}
          tenantName={tenant.name}
          slug={slug}
          spaceSlug={spaceSlug}
          spaceId={space.id}
          isMember={isMember}
          query={forumQuery}
        />
      </div>
    );
  }

  // ----- Gallery: media-package folders (images + videos, free or for sale) -----
  if (space.type === "GALLERY") {
    const nowG = new Date();
    const rows = await prisma.mediaPackage.findMany({
      where: {
        tenantId: tenant.id,
        spaceId: space.id,
        isPublished: true,
        // Hide packages whose campaign window has ended.
        OR: [{ availableUntil: null }, { availableUntil: { gt: nowG } }],
      },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    const packages: CPackage[] = rows.map((p) => {
      const packageAccess = ctx.isStaff || p.priceCents === 0 || ctx.keys.has(p.entitlementKey);
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        coverUrl: p.coverUrl,
        priceCents: p.priceCents,
        owned: packageAccess,
        itemCount: p.items.length,
        imageCount: p.items.filter((i) => i.type === "IMAGE").length,
        videoCount: p.items.filter((i) => i.type === "VIDEO").length,
        items: p.items.map((i) => {
          // An item is unlocked when the package is owned, it is a free preview,
          // or it was purchased individually. Never leak locked media URLs.
          const itemUnlocked =
            packageAccess ||
            i.isPreview ||
            (i.priceCents > 0 && !!i.entitlementKey && ctx.keys.has(i.entitlementKey));
          return {
            id: i.id,
            type: i.type === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const),
            url: itemUnlocked ? i.url : null,
            caption: i.caption,
            locked: !itemUnlocked,
            priceCents: i.priceCents,
            teaserUrl: i.teaserUrl,
          };
        }),
      };
    });
    return (
      <div>
        {header}
        {packages.length === 0 ? (
          <EmptyState icon="gallery" title={t("noMedia")} hint={t("noMediaHint")} />
        ) : (
          <GalleryFolders
            slug={slug}
            space={spaceSlug}
            packages={packages}
            initialOpen={open ?? purchased ?? null}
          />
        )}
      </div>
    );
  }

  // ----- Blog: settings-driven article index -----
  if (space.type === "BLOG") {
    const cfg = parseBlogSettings(space.settings);
    const sortOrder =
      cfg.sort === "OLDEST"
        ? { createdAt: "asc" as const }
        : cfg.sort === "AZ"
          ? { title: "asc" as const }
          : cfg.sort === "ZA"
            ? { title: "desc" as const }
            : { createdAt: "desc" as const };

    const where = { tenantId: tenant.id, spaceId: space.id, isPublished: true };
    const total = await prisma.post.count({ where });
    const perPage = cfg.pageSize > 0 ? cfg.pageSize : total || 1;
    const pageCount = Math.max(1, Math.ceil(total / perPage));
    const current = Math.min(Math.max(1, Number(page) || 1), pageCount);

    const raw = await prisma.post.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, sortOrder],
      skip: cfg.pageSize > 0 ? (current - 1) * perPage : 0,
      take: cfg.pageSize > 0 ? perPage : undefined,
      include: {
        author: { select: { name: true, avatarUrl: true } },
        _count: { select: { comments: true } },
      },
    });
    const blogPosts: BlogPost[] = raw.map((p) => {
      const words = (p.body || "").trim().split(/\s+/).filter(Boolean).length;
      return {
        id: p.id,
        title: p.title || excerpt(p.body, 60) || t("untitled"),
        excerpt: excerpt(p.body, 200),
        coverUrl: p.imageUrl,
        authorName: p.author.name,
        authorAvatar: p.author.avatarUrl,
        createdAt: p.createdAt,
        readMinutes: Math.max(1, Math.round(words / 200)),
        comments: p._count.comments,
      };
    });
    return (
      <div>
        {header}
        <BlogIndex
          slug={slug}
          space={spaceSlug}
          posts={blogPosts}
          settings={cfg}
          page={current}
          pageCount={pageCount}
        />
      </div>
    );
  }

  // ----- Feed / Videos: posts -----
  if (["FEED", "VIDEOS", "PODCAST"].includes(space.type)) {
    const feedQuery = (q ?? "").trim().slice(0, 80);
    const now = new Date();
    const raw = await prisma.post.findMany({
      where: {
        tenantId: tenant.id,
        spaceId: space.id,
        isPublished: true,
        // Scheduled posts stay hidden from the community until go-live.
        publishedAt: { lte: now },
        ...(feedQuery
          ? {
              OR: [
                { title: { contains: feedQuery, mode: "insensitive" as const } },
                { body: { contains: feedQuery, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: {
        author: { select: { name: true, avatarUrl: true } },
        _count: { select: { comments: true, reactions: true } },
        reactions: {
          where: { userId: user?.id ?? "__anon__", type: "LIKE" },
          select: { id: true },
        },
      },
    });
    const posts: PostCardData[] = raw.map((p) => {
      const locked =
        p.priceCents > 0 &&
        !ctx.isStaff &&
        (!p.entitlementKey || !ctx.keys.has(p.entitlementKey));
      return {
        id: p.id,
        title: p.title,
        // Never leak gated body/media to non-buyers.
        body: locked ? "" : p.body,
        bodyHtml: locked ? null : p.bodyHtml,
        imageUrl: locked ? null : p.imageUrl,
        videoUrl: locked ? null : p.videoUrl,
        createdAt: p.createdAt,
        author: p.author,
        likes: p._count.reactions,
        comments: p._count.comments,
        likedByMe: p.reactions.length > 0,
        locked,
        priceCents: p.priceCents,
        currency: p.currency,
        teaserUrl: p.teaserUrl,
      };
    });

    // Podcast: episode list with inline audio player.
    if (space.type === "PODCAST") {
      return (
        <div className="mx-auto max-w-3xl">
          {header}
          {posts.length === 0 ? (
            <EmptyState icon="podcast" title={t("noEpisodes")} />
          ) : (
            <div className="space-y-4">
              {posts.map((p, i) => (
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
                        {t("episodeNum", { num: posts.length - i })} · {timeAgo(p.createdAt, locale)}
                      </p>
                      <h2 className="display-serif mt-1 text-xl leading-snug text-[#161613] sm:text-2xl">
                        {p.title || t("episode")}
                      </h2>
                      {p.body && (
                        <p className="mt-2 text-sm leading-6 text-[#161613]/60">
                          {p.body}
                        </p>
                      )}
                    </div>
                  </div>
                  {p.videoUrl && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio
                      src={p.videoUrl}
                      controls
                      preload="metadata"
                      className="mt-4 w-full"
                    />
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Videos: video grid.
    if (space.type === "VIDEOS") {
      return (
        <div>
          {header}
          {posts.length === 0 ? (
            <EmptyState icon="videos" title={t("noVideos")} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {posts.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-xl border border-[#161613]/10 bg-white">
                  {p.locked ? (
                    <div className="relative w-full overflow-hidden bg-[#161613]/5" style={{ aspectRatio: "16 / 9" }}>
                      {p.teaserUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.teaserUrl} alt="" className="absolute inset-0 h-full w-full object-cover blur-lg" />
                      )}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#161613]/45 text-white">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#161613]/70">
                          <Icon name="lock" size={22} />
                        </span>
                        <form action={purchasePostAction}>
                          <input type="hidden" name="tenant" value={slug} />
                          <input type="hidden" name="space" value={spaceSlug} />
                          <input type="hidden" name="postId" value={p.id} />
                          <ImmediateAccessConsent inverse className="mb-2 max-w-xs" />
                          <button className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#161613] transition hover:bg-white/90 active:scale-[0.99]">
                            <Icon name="lock" size={15} />
                            {t("unlockFor", { price: formatPrice(p.priceCents ?? 0, p.currency ?? PLATFORM_CURRENCY, locale) })}
                          </button>
                        </form>
                      </div>
                    </div>
                  ) : (
                    p.videoUrl && (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={p.videoUrl} controls preload="metadata" className="aspect-video w-full bg-black" />
                    )
                  )}
                  {(p.title || p.body) && (
                    <div className="p-3">
                      {p.title && <p className="text-sm font-semibold text-[#161613]">{p.title}</p>}
                      {p.body && <p className="text-sm text-[#161613]/60">{p.body}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ------------------------------------------------------- Feed */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="display-serif text-2xl text-[#161613]">{space.name}</h1>
              {space.description && (
                <p className="mt-1 text-sm text-[#161613]/60">{space.description}</p>
              )}
            </div>
            {feedQuery && (
              <Link
                href={`/c/${slug}/s/${spaceSlug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#161613]/10 bg-white px-3 py-1.5 text-sm font-medium text-[#161613]/70 transition hover:bg-[#161613]/[0.03]"
              >
                <Icon name="close" size={14} />
                {t("resetSearch", { q: feedQuery })}
              </Link>
            )}
          </div>
          {isMember && !feedQuery && <PostComposer slug={slug} space={spaceSlug} />}
          {posts.length === 0 ? (
            feedQuery ? (
              <EmptyState
                icon="search"
                title={t("noResultsTitle", { q: feedQuery })}
                hint={t("tryOtherTerm")}
              />
            ) : (
              <EmptyState icon="feed" title={t("feedNoPostsTitle")} hint={t("feedNoPostsHint")} />
            )
          ) : (
            posts.map((p) => (
              <PostCard key={p.id} post={p} slug={slug} space={spaceSlug} />
            ))
          )}
        </div>

        <SpaceSidebar
          tenantId={tenant.id}
          tenantName={tenant.name}
          slug={slug}
          spaceSlug={spaceSlug}
          spaceId={space.id}
          isMember={isMember}
          query={feedQuery}
        />
      </div>
    );
  }

  // ----- Live -----
  if (space.type === "LIVE") {
    const sessions = await listLiveSessions(tenant.id, space.id);
    const activeSession = open ? await getLiveSession(tenant.id, open) : null;

    if (activeSession) {
      // Per-session paywall: a session can require a specific entitlement (e.g.
      // a premium tier) beyond the space's own visibility. Never stream to a
      // viewer who lacks it.
      const sessionLocked =
        !!activeSession.requiredEntitlementKey &&
        !ctx.isStaff &&
        !ctx.keys.has(activeSession.requiredEntitlementKey);
      if (sessionLocked) {
        return (
          <div className="mx-auto max-w-xl">
            <div className="mb-4">
              <Link
                href={`/c/${slug}/s/${spaceSlug}`}
                className="inline-flex items-center gap-1.5 text-sm text-[#161613]/60 transition hover:text-[#161613]"
              >
                <Icon name="chevron" size={14} className="rotate-90" />
                {space.name}
              </Link>
            </div>
            <Card>
              <CardBody className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)]">
                  <Icon name="lock" size={26} className="text-[var(--brand)]" />
                </div>
                <h1 className="display-serif mt-3 text-2xl text-[#161613]">{activeSession.title}</h1>
                <p className="mt-2 text-[#161613]/60">{t("lockedDesc")}</p>
                <div className="mt-5">
                  <ButtonLink href={`/c/${slug}/join`} variant="brand">
                    {isMember ? t("upgradeMembership") : t("join")}
                  </ButtonLink>
                </div>
              </CardBody>
            </Card>
          </div>
        );
      }
      const canChat = isMember || ctx.isStaff;
      const recent = await fetchRecentLiveMessages(tenant.id, activeSession.id, 80);
      return (
        <div>
          <div className="mb-4">
            <Link
              href={`/c/${slug}/s/${spaceSlug}`}
              className="inline-flex items-center gap-1.5 text-sm text-[#161613]/60 transition hover:text-[#161613]"
            >
              <Icon name="chevron" size={14} className="rotate-90" />
              {space.name}
            </Link>
            <h1 className="display-serif mt-2 text-2xl text-[#161613]">{activeSession.title}</h1>
          </div>
          <LiveRoom
            slug={slug}
            sessionId={activeSession.id}
            status={activeSession.status}
            streamUrl={activeSession.streamUrl}
            replayUrl={activeSession.replayUrl}
            canChat={canChat}
            initialMessages={recent.map((m) => ({
              id: m.id,
              body: m.body,
              createdAt: m.createdAt.toISOString(),
              user: m.user,
            }))}
          />
        </div>
      );
    }

    return (
      <div>
        {header}
        {sessions.length === 0 ? (
          <EmptyState icon="videos" title={t("liveNone")} hint={t("liveNoneHint")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/c/${slug}/s/${spaceSlug}?open=${s.id}`}
                className="group rounded-2xl border border-[#161613]/10 bg-white p-5 transition hover:border-[#161613]/25 hover:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <Pill
                    className={
                      s.status === "LIVE"
                        ? "bg-red-500/90 text-white"
                        : s.status === "SCHEDULED"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-[#161613]/5 text-[#161613]/60"
                    }
                  >
                    {t(`liveStatus.${s.status}`)}
                  </Pill>
                  {s.startsAt && (
                    <span className="text-xs text-[#161613]/50">{formatDateTime(s.startsAt, locale)}</span>
                  )}
                </div>
                <h2 className="display-serif mt-3 text-xl text-[#161613] group-hover:text-[color:var(--brand)]">
                  {s.title}
                </h2>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ----- Requests (public wishes board, Reddit-style voting) -----
  if (space.type === "REQUESTS") {
    const tReq = await getTranslations("community.render.requests");
    const requests = await prisma.memberRequest.findMany({
      where: {
        tenantId: tenant.id,
        spaceId: space.id,
        // Everyone sees the board; declined wishes are hidden except from their
        // own author. Staff see everything.
        ...(ctx.isStaff
          ? {}
          : {
              OR: [
                { status: { not: "DECLINED" as const } },
                { requesterId: user?.id ?? "__none__" },
              ],
            }),
      },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { requester: { select: { name: true, avatarUrl: true } } },
    });
    const myVotes = user
      ? await prisma.requestVote.findMany({
          where: { tenantId: tenant.id, userId: user.id, requestId: { in: requests.map((r) => r.id) } },
          select: { requestId: true, value: true },
        })
      : [];
    const voteMap = new Map<string, "UP" | "DOWN">(
      myVotes.map((v) => [v.requestId, v.value === 1 ? "UP" : "DOWN"]),
    );
    const statusCls: Record<string, string> = {
      OPEN: "bg-slate-100 text-slate-600",
      ACCEPTED: "bg-blue-100 text-blue-700",
      PRICED: "bg-amber-100 text-amber-700",
      FULFILLED: "bg-emerald-100 text-emerald-700",
      DECLINED: "bg-red-100 text-red-600",
    };
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        {isMember && (
          <form action={submitRequestAction} className="mb-6 rounded-2xl border border-[#161613]/10 bg-white p-5">
            <input type="hidden" name="tenant" value={slug} />
            <input type="hidden" name="space" value={spaceSlug} />
            <input
              name="title"
              required
              maxLength={160}
              placeholder={tReq("titlePlaceholder")}
              className="w-full rounded-lg border border-[#161613]/15 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            <textarea
              name="body"
              rows={3}
              maxLength={4000}
              placeholder={tReq("bodyPlaceholder")}
              className="mt-3 w-full rounded-lg border border-[#161613]/15 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            <div className="mt-3 flex justify-end">
              <button className="inline-flex items-center gap-2 rounded-xl bg-[#161613] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#33332e]">
                {tReq("submit")}
              </button>
            </div>
          </form>
        )}
        {requests.length === 0 ? (
          <EmptyState icon="messages" title={tReq("empty")} hint={tReq("emptyHint")} />
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="flex gap-3 rounded-2xl border border-[#161613]/10 bg-white p-4">
                <RequestVoteControl
                  tenant={slug}
                  space={spaceSlug}
                  requestId={r.id}
                  score={r.score}
                  myVote={voteMap.get(r.id) ?? null}
                  canVote={isMember}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={r.requester.name} src={r.requester.avatarUrl} size={22} />
                      <span className="truncate text-xs font-medium text-[#161613]/55">{r.requester.name}</span>
                    </div>
                    <Pill className={statusCls[r.status]}>{tReq(`status.${r.status}`)}</Pill>
                  </div>
                  <p className="mt-2 font-semibold text-[#161613]">{r.title}</p>
                  {r.body && <p className="mt-1 text-sm text-[#161613]/70">{r.body}</p>}
                  {r.staffNote && (
                    <p className="mt-2 rounded-lg bg-[#161613]/[0.03] px-3 py-2 text-sm text-[#161613]/70">
                      {r.staffNote}
                    </p>
                  )}
                  {r.status === "PRICED" && r.requesterId === user?.id && (
                    <form action={purchaseRequestAction} className="mt-3">
                      <input type="hidden" name="tenant" value={slug} />
                      <input type="hidden" name="space" value={spaceSlug} />
                      <input type="hidden" name="requestId" value={r.id} />
                      <button className="inline-flex items-center gap-2 rounded-xl bg-[#161613] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#33332e]">
                        <Icon name="lock" size={15} />
                        {tReq("payFor", { price: formatPrice(r.priceCents, r.currency, locale) })}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ----- Booking (1:1 slots) -----
  if (space.type === "BOOKING") {
    const tBook = await getTranslations("community.render.booking");
    const nowB = new Date();
    const slots = await prisma.bookingSlot.findMany({
      where: { tenantId: tenant.id, spaceId: space.id, isPublished: true, startsAt: { gte: nowB } },
      orderBy: { startsAt: "asc" },
      take: 50,
      include: {
        _count: { select: { reservations: true } },
        reservations: user
          ? { where: { userId: user.id, status: { in: ["CONFIRMED", "PENDING"] } }, select: { id: true } }
          : false,
      },
    });
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        {slots.length === 0 ? (
          <EmptyState icon="clock" title={tBook("empty")} hint={tBook("emptyHint")} />
        ) : (
          <div className="space-y-3">
            {slots.map((s) => {
              const taken = s._count.reservations >= s.capacity;
              const mine = Array.isArray(s.reservations) && s.reservations.length > 0;
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#161613]/10 bg-white p-5">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#161613]">{s.title}</p>
                    <p className="mt-1 text-sm text-[#161613]/55">
                      {formatDateTime(s.startsAt, locale)} · {tBook("minutes", { count: s.durationMin })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[#161613]">
                      {s.priceCents === 0 ? tBook("free") : formatPrice(s.priceCents, s.currency, locale)}
                    </span>
                    {mine ? (
                      <Pill className="bg-emerald-100 text-emerald-700">{tBook("reserved")}</Pill>
                    ) : taken ? (
                      <Pill className="bg-[#161613]/5 text-[#161613]/50">{tBook("full")}</Pill>
                    ) : isMember ? (
                      <form action={reserveBookingAction}>
                        <input type="hidden" name="tenant" value={slug} />
                        <input type="hidden" name="space" value={spaceSlug} />
                        <input type="hidden" name="slotId" value={s.id} />
                        <button className="inline-flex items-center gap-2 rounded-xl bg-[#161613] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#33332e]">
                          {tBook("reserve")}
                        </button>
                      </form>
                    ) : (
                      <Link href={`/c/${slug}/join`} className="text-sm font-semibold text-[color:var(--brand)]">
                        {tBook("joinToBook")}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ----- Stories (ephemeral, 24h) -----
  if (space.type === "STORIES") {
    const tStory = await getTranslations("community.render.stories");
    const nowSt = new Date();
    const rows = await prisma.story.findMany({
      where: {
        tenantId: tenant.id,
        spaceId: space.id,
        publishAt: { lte: nowSt },
        expiresAt: { gt: nowSt },
      },
      orderBy: { publishAt: "desc" },
      take: 100,
      include: { author: { select: { name: true, avatarUrl: true } } },
    });
    const groups = groupStoriesByAuthor(rows);
    return (
      <div>
        {header}
        {groups.length === 0 ? (
          <EmptyState icon="sparkles" title={tStory("empty")} hint={tStory("emptyHint")} />
        ) : (
          <StoryViewer
            variant="cards"
            autoplaySeconds={parseStorySettings(space.settings).autoplaySeconds}
            groups={groups}
          />
        )}
      </div>
    );
  }

  // ----- Tips wall -----
  if (space.type === "TIPS") {
    const tTip = await getTranslations("community.render.tips");
    const settingsObj =
      space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
        ? (space.settings as Record<string, unknown>)
        : {};
    const goalCents = Number(settingsObj.tipGoalCents) || 0;
    const [agg, tips] = await Promise.all([
      prisma.tip.aggregate({
        where: { tenantId: tenant.id, spaceId: space.id, status: "PAID" },
        _sum: { amountCents: true },
      }),
      prisma.tip.findMany({
        where: { tenantId: tenant.id, spaceId: space.id, status: "PAID", isPublic: true },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { name: true, avatarUrl: true } } },
      }),
    ]);
    const raised = agg._sum.amountCents ?? 0;
    const pct = goalCents > 0 ? Math.min(100, Math.round((raised / goalCents) * 100)) : 0;
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        {goalCents > 0 && (
          <div className="mb-6 rounded-2xl border border-[#161613]/10 bg-white p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-[#161613]">{formatPrice(raised, PLATFORM_CURRENCY, locale)}</span>
              <span className="text-[#161613]/50">{tTip("goal", { goal: formatPrice(goalCents, PLATFORM_CURRENCY, locale) })}</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#161613]/10">
              <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        {isMember && (
          <form action={tipAction} className="mb-6 rounded-2xl border border-[#161613]/10 bg-white p-5">
            <input type="hidden" name="tenant" value={slug} />
            <input type="hidden" name="space" value={spaceSlug} />
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-[#161613]/60">{tTip("amountLabel")}</label>
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="5,00"
                  className="w-full rounded-lg border border-[#161613]/15 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none"
                />
              </div>
              <button className="inline-flex items-center gap-2 rounded-xl bg-[#161613] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#33332e]">
                <Icon name="heart" size={15} /> {tTip("send")}
              </button>
            </div>
            <input
              name="message"
              maxLength={280}
              placeholder={tTip("messagePlaceholder")}
              className="mt-3 w-full rounded-lg border border-[#161613]/15 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </form>
        )}
        {tips.length === 0 ? (
          <EmptyState icon="heart" title={tTip("empty")} hint={tTip("emptyHint")} />
        ) : (
          <div className="space-y-3">
            {tips.map((tp) => (
              <div key={tp.id} className="flex items-start gap-3 rounded-2xl border border-[#161613]/10 bg-white p-4">
                <Avatar name={tp.user.name} src={tp.user.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold text-[#161613]">{tp.user.name}</span>{" "}
                    <span className="text-[color:var(--brand)]">{formatPrice(tp.amountCents, tp.currency, locale)}</span>
                  </p>
                  {tp.message && <p className="mt-0.5 text-sm text-[#161613]/70">{tp.message}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ----- Calendar (read-only aggregation of events, live, scheduled posts) -----
  if (space.type === "CALENDAR") {
    const tCal = await getTranslations("community.render.calendar");
    const nowC = new Date();
    const [events, lives, scheduled] = await Promise.all([
      prisma.event.findMany({
        where: { tenantId: tenant.id, startsAt: { gte: nowC } },
        orderBy: { startsAt: "asc" },
        take: 50,
        select: { id: true, title: true, startsAt: true, space: { select: { slug: true } } },
      }),
      prisma.liveSession.findMany({
        where: { tenantId: tenant.id, startsAt: { gte: nowC }, status: { not: "ENDED" } },
        orderBy: { startsAt: "asc" },
        take: 50,
        select: { id: true, title: true, startsAt: true, space: { select: { slug: true } } },
      }),
      prisma.post.findMany({
        where: { tenantId: tenant.id, scheduledAt: { not: null, gte: nowC } },
        orderBy: { scheduledAt: "asc" },
        take: 50,
        select: { id: true, title: true, scheduledAt: true, space: { select: { slug: true } } },
      }),
    ]);
    type CalEntry = { id: string; title: string; when: Date; kind: "event" | "live" | "post"; href: string | null };
    const entries: CalEntry[] = [
      ...events.map((e) => ({ id: `e-${e.id}`, title: e.title, when: e.startsAt, kind: "event" as const, href: e.space ? `/c/${slug}/s/${e.space.slug}` : null })),
      ...lives.map((l) => ({ id: `l-${l.id}`, title: l.title, when: l.startsAt as Date, kind: "live" as const, href: l.space ? `/c/${slug}/s/${l.space.slug}?open=${l.id}` : null })),
      ...scheduled.map((p) => ({ id: `p-${p.id}`, title: p.title || tCal("untitledPost"), when: p.scheduledAt as Date, kind: "post" as const, href: p.space ? `/c/${slug}/s/${p.space.slug}` : null })),
    ]
      .filter((x) => x.when)
      .sort((a, b) => a.when.getTime() - b.when.getTime());

    const kindCls: Record<string, string> = {
      event: "bg-blue-100 text-blue-700",
      live: "bg-red-100 text-red-700",
      post: "bg-slate-100 text-slate-600",
    };
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        {entries.length === 0 ? (
          <EmptyState icon="events" title={tCal("empty")} hint={tCal("emptyHint")} />
        ) : (
          <div className="space-y-3">
            {entries.map((x) => {
              const inner = (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#161613]/10 bg-white p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#161613]">{x.title}</p>
                    <p className="mt-1 text-sm text-[#161613]/55">{formatDateTime(x.when, locale)}</p>
                  </div>
                  <Pill className={kindCls[x.kind]}>{tCal(`kind.${x.kind}`)}</Pill>
                </div>
              );
              return x.href ? (
                <Link key={x.id} href={x.href} className="block transition hover:opacity-90">
                  {inner}
                </Link>
              ) : (
                <div key={x.id}>{inner}</div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ----- Course -----
  if (space.type === "COURSE") {
    const courses = await prisma.course.findMany({
      where: { tenantId: tenant.id, spaceId: space.id, isPublished: true },
      orderBy: { createdAt: "asc" },
      include: { lessons: { orderBy: { sortOrder: "asc" } } },
    });
    const completed = user
      ? new Set(
          (
            await prisma.lessonProgress.findMany({
              where: { tenantId: tenant.id, userId: user.id },
              select: { lessonId: true },
            })
          ).map((p) => p.lessonId),
        )
      : new Set<string>();
    return (
      <div className="space-y-5">
        {header}
        {courses.length === 0 && <EmptyState icon="courses" title={t("noCourses")} />}
        {courses.map((c) => (
          <Card key={c.id}>
            <CardBody>
              <div className="flex items-center gap-2">
                <h2 className="display-serif text-xl text-[#161613]">{c.title}</h2>
                <Pill className={c.format === "OFFLINE" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}>
                  {c.format === "OFFLINE" ? t("onsite") : t("online")}
                </Pill>
              </div>
              {c.description && (
                <p className="mt-1 text-sm text-[#161613]/60">{c.description}</p>
              )}

              {c.format === "ONLINE" && (c.videoUrl || c.streamUrl) && (
                <div className="mt-3 space-y-2">
                  {c.videoUrl &&
                    (c.videoUrl.startsWith("/api/media/") ||
                    c.videoUrl.startsWith("/uploads/") ||
                    /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(c.videoUrl) ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video
                        src={c.videoUrl}
                        controls
                        preload="metadata"
                        className="w-full rounded-xl border border-[#161613]/10 bg-black"
                      />
                    ) : (
                      <ButtonLink href={c.videoUrl} size="sm" variant="brand" target="_blank" rel="noopener noreferrer">
                        {t("watchVideo")}
                      </ButtonLink>
                    ))}
                  {c.streamUrl && (
                    <ButtonLink href={c.streamUrl} size="sm" variant="secondary" target="_blank" rel="noopener noreferrer">
                      {t("joinStream")}
                    </ButtonLink>
                  )}
                </div>
              )}

              {c.format === "OFFLINE" && (c.location || c.startsAt || c.capacity) && (
                <div className="mt-3 space-y-1 rounded-xl bg-[#161613]/[0.03] p-3 text-sm text-[#161613]/70">
                  {c.location && (
                    <p><span className="font-medium text-[#161613]/80">{t("location")}</span> {c.location}{c.address ? `, ${c.address}` : ""}</p>
                  )}
                  {c.startsAt && (
                    <p><span className="font-medium text-[#161613]/80">{t("date")}</span> {formatDateTime(c.startsAt, locale)}</p>
                  )}
                  {c.capacity ? (
                    <p><span className="font-medium text-[#161613]/80">{t("seats")}</span> {c.capacity}</p>
                  ) : null}
                </div>
              )}

              <ul className="mt-4 divide-y divide-[#161613]/10">
                {c.lessons.map((l) => {
                  // Drip-Content: gesperrt bis N Tage nach Beitritt (Staff sieht alles).
                  const joinedAt = ctx.membership?.joinedAt ?? null;
                  const unlocked =
                    ctx.isStaff || isLessonUnlocked(joinedAt, l.dripAfterDays);
                  const waitDays =
                    !unlocked && joinedAt && l.dripAfterDays
                      ? daysUntilUnlock(joinedAt, l.dripAfterDays)
                      : null;
                  return (
                  <li key={l.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className={`text-sm font-medium ${unlocked ? "text-[#161613]" : "text-[#161613]/40"}`}>
                        {l.title}
                      </p>
                      {unlocked && l.videoUrl && (
                        <p className="flex items-center gap-1 text-xs text-[#161613]/50">
                          <Icon name="videos" size={12} /> {t("video")}
                        </p>
                      )}
                    </div>
                    {!unlocked ? (
                      <Pill className="bg-[#161613]/5 text-[#161613]/50">
                        <Icon name="lock" size={11} className="mr-1" />
                        {waitDays
                          ? t("inDays", { count: waitDays })
                          : t("fromDay", { day: l.dripAfterDays ?? 0 })}
                      </Pill>
                    ) : completed.has(l.id) ? (
                      <Pill className="bg-green-100 text-green-700">{t("done")}</Pill>
                    ) : isMember ? (
                      <form action={completeLessonAction}>
                        <input type="hidden" name="tenant" value={slug} />
                        <input type="hidden" name="lessonId" value={l.id} />
                        <Button size="sm" variant="secondary">
                          {t("complete")}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                  );
                })}
                {c.lessons.length === 0 && (
                  <li className="py-3 text-sm text-[#161613]/50">{t("noLessons")}</li>
                )}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  // ----- Shop -----
  if (space.type === "SHOP") {
    // Dashboard products are a tenant-wide catalogue (spaceId null); also show
    // products explicitly assigned to this shop space.
    const products = await prisma.product.findMany({
      where: {
        tenantId: tenant.id,
        isPublished: true,
        OR: [{ spaceId: space.id }, { spaceId: null }],
      },
      orderBy: { createdAt: "desc" },
    });
    const owned = user
      ? new Set(
          (
            await prisma.order.findMany({
              where: { tenantId: tenant.id, userId: user.id, status: "PAID" },
              select: { productId: true },
            })
          ).map((o) => o.productId),
        )
      : new Set<string | null>();
    return (
      <div>
        {header}
        {products.length === 0 ? (
          <EmptyState icon="products" title={t("noProducts")} hint={t("noProductsHint")} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => {
              const isOwned = owned.has(p.id);
              const soldOut = p.stock !== null && p.stock <= 0;
              return (
                <div
                  key={p.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-[#161613]/10 bg-white transition hover:border-[#161613]/25 hover:shadow-md"
                >
                  <div className="relative w-full overflow-hidden bg-[#161613]/5" style={{ aspectRatio: "4 / 3" }}>
                    {(p.images.length > 0 ? p.images : p.coverUrl ? [p.coverUrl] : []).length > 0 ? (
                      <ProductCarousel
                        images={p.images.length > 0 ? p.images : p.coverUrl ? [p.coverUrl] : []}
                        alt={p.name}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[#161613]/30">
                        <Icon name="products" size={30} />
                      </div>
                    )}
                    <span className="absolute left-2.5 top-2.5">
                      <Pill className="bg-white/85 text-[#161613]/80 shadow-sm backdrop-blur">
                        {tPType(productTypeKey(p.type))}
                      </Pill>
                    </span>
                    {isOwned && (
                      <span className="absolute right-2.5 top-2.5">
                        <Pill className="bg-emerald-500/90 text-white shadow-sm backdrop-blur">{t("owned")}</Pill>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="display-serif text-lg text-[#161613]">{p.name}</h3>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 flex-1 text-sm text-[#161613]/60">{p.description}</p>
                    )}
                    {p.requiresShipping && (
                      <p className="mt-2 inline-flex items-center gap-1 text-xs text-[#161613]/50">
                        {p.freeShipping
                          ? tShop("freeShipping")
                          : p.stock !== null && p.stock > 0
                            ? tShop("shippingCostStock", { price: formatPrice(p.shippingCents, PLATFORM_CURRENCY, locale), count: p.stock })
                            : tShop("shippingCost", { price: formatPrice(p.shippingCents, PLATFORM_CURRENCY, locale) })}
                      </p>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="display-serif text-xl text-[#161613]">
                        {p.priceCents === 0 ? tShop("free") : formatPrice(p.priceCents, PLATFORM_CURRENCY, locale)}
                      </span>
                      {isOwned ? (
                        p.downloadUrl ? (
                          <ButtonLink href={p.downloadUrl} size="sm" variant="secondary">
                            {tShop("download")}
                          </ButtonLink>
                        ) : (
                          <Pill className="bg-emerald-100 text-emerald-700">{t("ownedCheck")}</Pill>
                        )
                      ) : soldOut ? (
                        <Pill className="bg-[#161613]/5 text-[#161613]/60">{tShop("soldOut")}</Pill>
                      ) : (
                        <form action={purchaseProductAction}>
                          <input type="hidden" name="tenant" value={slug} />
                          <input type="hidden" name="productId" value={p.id} />
                          {p.priceCents > 0 && p.type !== "PHYSICAL" && (
                            <ImmediateAccessConsent className="mb-2 max-w-56" />
                          )}
                          <PurchaseSubmitButton>
                            {p.priceCents === 0 ? tShop("get") : tShop("buy")}
                          </PurchaseSubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ----- Chat (Patreon-style hub: groups + direct messages) -----
  if (space.type === "CHAT") {
    const chatSettings = parseChatSettings(space.settings);

    // All group chats (CHAT spaces) the member can access, for the left list.
    const chatSpaceRows = await prisma.space.findMany({
      where: { tenantId: tenant.id, type: "CHAT", isArchived: false },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        visibility: true,
        requiredEntitlementKey: true,
      },
    });
    const accessibleGroups = chatSpaceRows.filter((s) => canAccess(s, ctx));

    const [threads, memberRows, tierRows] = await Promise.all([
      listHubThreads(
        tenant.id,
        user?.id ?? "",
        accessibleGroups.map((s) => ({ spaceId: s.id, slug: s.slug, name: s.name })),
      ),
      prisma.membership.findMany({
        where: { tenantId: tenant.id, status: "ACTIVE" },
        orderBy: { joinedAt: "asc" },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      prisma.membershipTier.findMany({
        where: { tenantId: tenant.id },
        orderBy: { sortOrder: "asc" },
        select: { name: true, entitlementKey: true },
      }),
    ]);

    const members = memberRows
      .filter((m) => m.user.id !== user?.id)
      .map((m) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl }));
    const levels = tierRows.map((t) => ({ key: t.entitlementKey, name: t.name }));

    // Right pane: an open direct message (?dm=) or the current group chat.
    const dmThread = dm && user ? await getDirectThread(tenant.id, user.id, dm) : null;

    const groupCanWrite =
      chatSettings.postPolicy === "STAFF" ? ctx.isStaff : isMember || ctx.isStaff;

    const thread = dmThread ? (
      <ChatThread
        key={`dm-${dmThread.id}`}
        slug={slug}
        target={{ kind: "dm", id: dmThread.id }}
        title={dmThread.otherUser.name}
        subtitle={t("directMessage")}
        headerAvatarUrl={dmThread.otherUser.avatarUrl}
        meId={user!.id}
        canWrite={isMember || ctx.isStaff}
        joinHref={`/c/${slug}/join`}
        framed={false}
        initialMessages={dmThread.messages}
      />
    ) : (
      <ChatThread
        key={`space-${space.id}`}
        slug={slug}
        target={{ kind: "space", id: space.id }}
        title={space.name}
        subtitle={space.description ?? t("liveChat")}
        topic={chatSettings.topic}
        maxLength={chatSettings.maxMessageLength}
        readOnlyReason={
          chatSettings.postPolicy === "STAFF" && !groupCanWrite
            ? t("staffOnlyChat")
            : null
        }
        meId={user?.id ?? ""}
        canWrite={groupCanWrite}
        joinHref={`/c/${slug}/join`}
        framed={false}
        initialMessages={await fetchSpaceMessages(tenant.id, space.id, chatSettings.historyLimit)}
      />
    );

    return (
      <div className="flex h-[calc(100dvh-4rem)] min-h-[520px] overflow-hidden">
        <ChatHub
          slug={slug}
          currentSpaceSlug={space.slug}
          activeKind={dmThread ? "DIRECT" : "GROUP"}
          activeId={dmThread ? dmThread.id : space.slug}
          threads={threads}
          members={members}
          levels={levels}
          isStaff={ctx.isStaff}
        />
        <div className="min-w-0 flex-1">{thread}</div>
      </div>
    );
  }

  // ----- Events -----
  if (space.type === "EVENTS") {
    const events = await prisma.event.findMany({
      where: { tenantId: tenant.id, spaceId: space.id },
      orderBy: { startsAt: "asc" },
      include: { _count: { select: { rsvps: true } } },
    });
    const myRsvps = user
      ? new Set(
          (
            await prisma.eventRsvp.findMany({
              where: { tenantId: tenant.id, userId: user.id },
              select: { eventId: true },
            })
          ).map((r) => r.eventId),
        )
      : new Set<string>();
    return (
      <div className="space-y-4">
        {header}
        {events.map((e) => (
          <Card key={e.id}>
            <CardBody className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-[#161613]">{e.title}</p>
                <p className="mt-1 text-sm text-[#161613]/60">
                  {formatDateTime(e.startsAt, locale)}
                  {e.location ? ` · ${e.location}` : ""} · {t("rsvps", { count: e._count.rsvps })}
                </p>
              </div>
              {isMember && (
                <form action={rsvpEventAction}>
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="eventId" value={e.id} />
                  <Button size="sm" variant={myRsvps.has(e.id) ? "secondary" : "brand"}>
                    {myRsvps.has(e.id) ? t("attended") : t("attend")}
                  </Button>
                </form>
              )}
            </CardBody>
          </Card>
        ))}
        {events.length === 0 && <EmptyState icon="events" title={t("noEvents")} />}
      </div>
    );
  }

  // ----- Newsletter -----
  if (space.type === "NEWSLETTER") {
    const sent = await prisma.newsletterCampaign.findMany({
      where: { tenantId: tenant.id, status: "SENT" },
      orderBy: { sentAt: "desc" },
      take: 20,
    });
    return (
      <div className="space-y-4">
        {header}
        {sent.map((c) => (
          <Card key={c.id}>
            <CardBody>
              <p className="font-semibold text-[#161613]">{c.subject}</p>
              <p className="mt-1 text-xs text-[#161613]/50">
                {c.sentAt ? timeAgo(c.sentAt, locale) : ""}
              </p>
              <div className="prose-body mt-2 whitespace-pre-wrap text-sm text-[#161613]/70">
                {c.body}
              </div>
            </CardBody>
          </Card>
        ))}
        {sent.length === 0 && <EmptyState icon="newsletter" title={t("noNewsletters")} />}
      </div>
    );
  }

  // ----- Knowledge base (settings-driven: sort, search, pagination, layout) -----
  if (space.type === "KNOWLEDGE") {
    const cfg = parseKnowledgeSettings(space.settings);
    const query = (q ?? "").trim();

    const orderBy =
      cfg.sort === "OLDEST"
        ? { createdAt: "asc" as const }
        : cfg.sort === "AZ"
          ? { title: "asc" as const }
          : cfg.sort === "ZA"
            ? { title: "desc" as const }
            : { createdAt: "desc" as const };

    const where = {
      tenantId: tenant.id,
      spaceId: space.id,
      isPublished: true,
      ...(cfg.showSearch && query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { body: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const total = await prisma.knowledgeArticle.count({ where });
    const perPage = cfg.pageSize > 0 ? cfg.pageSize : total || 1;
    const pageCount = Math.max(1, Math.ceil(total / perPage));
    const current = Math.min(Math.max(1, Number(page) || 1), pageCount);

    const articles = await prisma.knowledgeArticle.findMany({
      where,
      orderBy,
      ...(cfg.pageSize > 0 ? { skip: (current - 1) * perPage, take: perPage } : {}),
    });

    const buildHref = (params: Record<string, string | number | undefined>) => {
      const sp = new URLSearchParams();
      if (query) sp.set("q", query);
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === "" || v === 0) sp.delete(k);
        else sp.set(k, String(v));
      }
      const s = sp.toString();
      return `/c/${slug}/s/${spaceSlug}${s ? `?${s}` : ""}`;
    };

    return (
      <div>
        {header}

        {cfg.showSearch && (
          <form method="GET" className="mb-5">
            <div className="flex items-center gap-2 rounded-xl border border-[#161613]/10 bg-white px-3 py-2.5 focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
              <Icon name="search" size={17} className="text-[#161613]/50" />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder={t("searchArticles")}
                className="w-full bg-transparent text-sm outline-none placeholder:text-[#161613]/50"
              />
              {query && (
                <Link href={buildHref({ q: undefined, page: undefined })} className="text-xs font-medium text-[#161613]/50 hover:text-[#161613]/80">
                  {t("reset")}
                </Link>
              )}
            </div>
          </form>
        )}

        {total === 0 ? (
          <EmptyState
            icon={query ? "search" : "knowledge"}
            title={query ? t("noResultsShort") : t("noArticlesTitle")}
            hint={query ? t("noResultsHint", { q: query }) : undefined}
          />
        ) : (
          <div className={cfg.showIndex ? "lg:grid lg:grid-cols-[220px_1fr] lg:gap-8" : ""}>
            {cfg.showIndex && (
              <aside className="mb-5 lg:mb-0">
                <div className="lg:sticky lg:top-4">
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[#161613]/50">
                    {t("content")}
                  </p>
                  <nav className="space-y-0.5">
                    {articles.map((a) => (
                      <a
                        key={a.id}
                        href={`#a-${a.id}`}
                        className="block truncate rounded-lg px-3 py-1.5 text-sm text-[#161613]/70 transition hover:bg-[#161613]/5 hover:text-[#161613]"
                      >
                        {a.title}
                      </a>
                    ))}
                  </nav>
                </div>
              </aside>
            )}

            <div className="min-w-0">
              <div className={cfg.layout === "GRID" ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
                {articles.map((a) => (
                  <Card key={a.id}>
                    <CardBody>
                      <h2 id={`a-${a.id}`} className="display-serif scroll-mt-4 text-lg text-[#161613]">
                        {a.title}
                      </h2>
                      {cfg.showDates && (
                        <p className="mt-0.5 text-xs text-[#161613]/50">{formatDateTime(a.createdAt, locale)}</p>
                      )}
                      <div className="prose-body mt-2 whitespace-pre-wrap text-sm text-[#161613]/70">
                        {cfg.layout === "GRID" ? excerpt(a.body, 220) : a.body}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>

              {cfg.pageSize > 0 && pageCount > 1 && (
                <div className="mt-6 flex items-center justify-center gap-1.5">
                  <PageLink href={buildHref({ page: current - 1 })} disabled={current <= 1} label={t("prev")} />
                  <span className="px-3 text-sm text-[#161613]/60">
                    {t("pageOf", { page: current, pageCount })}
                  </span>
                  <PageLink href={buildHref({ page: current + 1 })} disabled={current >= pageCount} label={t("next")} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return <div>{header}</div>;
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-lg border border-[#161613]/10 px-3 py-1.5 text-sm font-medium text-[#161613]/30">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-[#161613]/10 px-3 py-1.5 text-sm font-medium text-[#161613]/80 transition hover:bg-[#161613]/[0.03]"
    >
      {label}
    </Link>
  );
}
