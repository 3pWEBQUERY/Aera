import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { canAccess } from "@/lib/entitlements";
import { GATE_SELECT, isPostLocked, postLockKind } from "@/lib/post-access";
import { readPostPoll } from "@/lib/polls";
import {
  getPostSettingsForPosts,
  readPostSettings,
  resolvePostId,
} from "@/lib/post-settings";
import { trimRichHtml } from "@/lib/rich-text";
import { purchasePostAction } from "@/app/actions/engage";
import { PostCard, type PostCardData } from "@/components/community/post-card";
import { PostSlider } from "@/components/community/post-slider";
import type { PostTileData } from "@/components/community/post-tile";
import { CommentThread } from "@/components/community/comment-thread";
import { ForumThread } from "@/components/community/forum-thread";
import { ArticleShare } from "@/components/community/article-share";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { ImmediateAccessConsent } from "@/components/community/immediate-access-consent";
import { MembersOnlyGate } from "@/components/community/members-only-gate";
import { excerpt, formatDate, formatPrice, timeAgo } from "@/lib/utils";

export default async function PostDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; spaceSlug: string; postId: string }>;
  searchParams: Promise<{ error?: string; purchased?: string }>;
}) {
  const { slug, spaceSlug, postId } = await params;
  const { error, purchased } = await searchParams;
  const [t, tPostTile, tGate, tSafety, tLegal, locale] = await Promise.all([
    getTranslations("spaces"),
    getTranslations("community.render.postTile"),
    getTranslations("community.gate"),
    getTranslations("billingSafety"),
    getTranslations("legalPurchase"),
    getLocale(),
  ]);
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, user, ctx } = community;

  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, slug: spaceSlug },
  });
  if (!space) notFound();

  // A post is reachable by its id or its optional custom slug.
  const lookupId = (await resolvePostId(tenant.id, space.id, postId)) ?? postId;
  const isStaff = ctx.isStaff;
  const isMember = ctx.membership?.status === "ACTIVE";
  const selfHref = `/c/${slug}/s/${spaceSlug}/${postId}`;

  // Geteilter Link ohne Zugriff: statt 404 eine Sperrseite mit dem Weg hinein.
  // Nur für Beiträge, die es wirklich gibt und die veröffentlicht sind —
  // alles andere bleibt 404. Vom Beitrag selbst steht dort nichts (kein
  // Titel, kein Text, keine Kommentare); der Space-Name ist ohnehin in der
  // Navigation sichtbar.
  const gatePage = (gate: {
    visibility: "PUBLIC" | "MEMBERS" | "PAID";
    requiredEntitlementKey?: string | null;
  }) => (
    <MembersOnlyGate
      slug={slug}
      tenantId={tenant.id}
      communityName={tenant.name}
      title={tGate("postTitle")}
      context={space.name}
      next={selfHref}
      loggedIn={Boolean(user)}
      isMember={isMember}
      gate={gate}
    />
  );
  if (!canAccess(space, ctx)) {
    const exists = await prisma.post.findFirst({
      where: {
        id: lookupId,
        tenantId: tenant.id,
        spaceId: space.id,
        isPublished: true,
        publishedAt: { lte: new Date() },
      },
      select: { id: true },
    });
    if (!exists) notFound();
    return gatePage(space);
  }

  // Zahlungs- und Zustimmungsfehler nach dem Freischalten dieses Beitrags.
  const notice =
    error === "checkout" || error === "payments-unavailable" ? (
      <p
        role="alert"
        className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {tSafety("checkoutNotStarted")}
      </p>
    ) : error === "legal-consent" ? (
      <p
        role="alert"
        className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        {tLegal("requiredError")}
      </p>
    ) : purchased ? (
      <p
        role="status"
        className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      >
        {tGate("postUnlocked")}
      </p>
    ) : null;

  // ----- Reddit-style forum thread -----
  if (space.type === "FORUM") {
    const fpost = await prisma.post.findFirst({
      where: { id: lookupId, tenantId: tenant.id, spaceId: space.id },
      include: {
        author: { select: { name: true, avatarUrl: true } },
        _count: { select: { comments: true } },
      },
    });
    if (!fpost) notFound();
    // Geplante oder zurückgezogene Beiträge sieht vor dem Termin nur das Team.
    if (!isStaff && (!fpost.isPublished || fpost.publishedAt.getTime() > Date.now())) {
      notFound();
    }
    if (isPostLocked(fpost, ctx)) {
      // Einzeln verkaufter Beitrag: Ihn öffnet nur der eigene Kauf, keine
      // Mitgliedschaft. Die Sperrseite darf deshalb keinen Tarif anbieten —
      // sie zeigt den Kauf, wie der Artikel-Pfad unten.
      if (fpost.priceCents > 0) {
        return (
          <div className="mx-auto max-w-md py-12 text-center sm:py-16">
            {notice}
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
              <Icon name="lock" size={24} />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/65">
              {space.name}
            </p>
            <h1 className="display-serif mt-1 text-2xl text-[#161613] sm:text-3xl">
              {fpost.title || tPostTile("paidUntitled")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#161613]/70">{tPostTile("paidHint")}</p>
            <form action={purchasePostAction} className="mx-auto mt-6 max-w-xs text-left">
              <input type="hidden" name="tenant" value={slug} />
              <input type="hidden" name="space" value={spaceSlug} />
              <input type="hidden" name="postId" value={fpost.id} />
              <input type="hidden" name="returnTo" value="post" />
              <ImmediateAccessConsent className="mb-3" />
              <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.99]">
                <Icon name="lock" size={16} />
                {t("unlockFor", { price: formatPrice(fpost.priceCents, fpost.currency, locale) })}
              </button>
            </form>
          </div>
        );
      }
      return gatePage({ visibility: fpost.visibility });
    }
    const fcomments = await prisma.comment.findMany({
      where: { tenantId: tenant.id, postId: fpost.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { name: true, avatarUrl: true } } },
    });
    const cIds = fcomments.map((c) => c.id);
    // Im Forum wird nur abgestimmt (Pfeile). Frühere Herz-Likes an Kommentaren
    // bleiben in der Datenbank, werden hier aber nicht mehr angezeigt.
    const [postGroups, postMine, cGroups, cMine] = await Promise.all([
      prisma.reaction.groupBy({ by: ["type"], where: { tenantId: tenant.id, postId: fpost.id, type: { in: ["UP", "DOWN"] } }, _count: true }),
      user ? prisma.reaction.findFirst({ where: { tenantId: tenant.id, userId: user.id, postId: fpost.id, type: { in: ["UP", "DOWN"] } }, select: { type: true } }) : Promise.resolve(null),
      cIds.length ? prisma.reaction.groupBy({ by: ["commentId", "type"], where: { tenantId: tenant.id, commentId: { in: cIds }, type: { in: ["UP", "DOWN"] } }, _count: true }) : Promise.resolve([]),
      user && cIds.length ? prisma.reaction.findMany({ where: { tenantId: tenant.id, userId: user.id, commentId: { in: cIds }, type: { in: ["UP", "DOWN"] } }, select: { commentId: true, type: true } }) : Promise.resolve([]),
    ]);
    const postScore = postGroups.reduce((s, g) => s + (g.type === "UP" ? 1 : -1) * (g._count as number), 0);
    const cScore: Record<string, number> = {};
    for (const g of cGroups) if (g.commentId) cScore[g.commentId] = (cScore[g.commentId] ?? 0) + (g.type === "UP" ? 1 : -1) * (g._count as number);
    const cMy: Record<string, "UP" | "DOWN"> = {};
    for (const v of cMine) if (v.commentId) cMy[v.commentId] = v.type as "UP" | "DOWN";

    const poll = await readPostPoll(tenant.id, fpost.id, user?.id ?? null);
    const settings = await readPostSettings(tenant.id, fpost.id);

    return (
      <ForumThread
        slug={slug}
        spaceSlug={spaceSlug}
        isMember={isMember}
        poll={poll}
        cover={{
          url: settings.coverUrl,
          x: settings.coverOffsetX,
          y: settings.coverOffsetY,
          zoom: settings.coverZoom,
        }}
        settings={{
          hideMetaInfo: settings.hideMetaInfo,
          hideLikes: settings.hideLikes,
          hideComments: settings.hideComments,
          closeComments: settings.closeComments,
          customHtml: settings.customHtml,
        }}
        post={{
          id: fpost.id,
          title: fpost.title,
          body: fpost.body,
          bodyHtml: fpost.bodyHtml ? trimRichHtml(fpost.bodyHtml) || null : null,
          imageUrl: fpost.imageUrl,
          videoUrl: fpost.videoUrl,
          authorName: fpost.author.name,
          authorAvatar: fpost.author.avatarUrl,
          createdAt: fpost.createdAt,
          score: postScore,
          myVote: (postMine?.type as "UP" | "DOWN" | undefined) ?? null,
          commentCount: fpost._count.comments,
        }}
        comments={fcomments.map((c) => ({
          id: c.id,
          body: c.body,
          authorName: c.author.name,
          authorAvatar: c.author.avatarUrl,
          createdAt: c.createdAt,
          parentId: c.parentId,
          score: cScore[c.id] ?? 0,
          myVote: cMy[c.id] ?? null,
        }))}
      />
    );
  }

  const post = await prisma.post.findFirst({
    where: { id: lookupId, tenantId: tenant.id, spaceId: space.id },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { comments: true, reactions: true } },
      reactions: {
        where: { userId: user?.id ?? "__anon__", type: "LIKE" },
        select: { id: true },
      },
    },
  });
  if (!post) notFound();

  // Scheduled / unpublished posts are only reachable by staff before go-live.
  if (!isStaff && (!post.isPublished || post.publishedAt.getTime() > Date.now())) {
    notFound();
  }

  // Sperre: Einzelverkauf oder "nur fuer Mitglieder" — siehe lib/post-access.
  const locked = isPostLocked(post, ctx);

  const comments = await prisma.comment.findMany({
    where: { tenantId: tenant.id, postId: post.id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true, avatarUrl: true } } },
  });
  // Likes je Kommentar in zwei Abfragen statt in einer pro Kommentar.
  const commentIds = comments.map((c) => c.id);
  const [likeGroups, myLikes] = commentIds.length
    ? await Promise.all([
        prisma.reaction.groupBy({
          by: ["commentId"],
          where: { tenantId: tenant.id, commentId: { in: commentIds }, type: "LIKE" },
          _count: true,
        }),
        user
          ? prisma.reaction.findMany({
              where: {
                tenantId: tenant.id,
                userId: user.id,
                commentId: { in: commentIds },
                type: "LIKE",
              },
              select: { commentId: true },
            })
          : Promise.resolve([]),
      ])
    : [[], []];
  const likeCount = new Map<string, number>();
  for (const g of likeGroups) if (g.commentId) likeCount.set(g.commentId, g._count as number);
  const likedByMe = new Set(myLikes.map((r) => r.commentId).filter(Boolean) as string[]);

  // Geschlossene Kommentare: kein Formular (der Server lehnt ohnehin ab).
  const canComment = isMember && !post.closeComments;

  // Gesperrt: keine Kommentare — die Diskussion zitiert den Inhalt.
  const commentsBlock = locked ? null : (
    <CommentThread
      slug={slug}
      spaceSlug={spaceSlug}
      postId={post.id}
      isMember={canComment}
      comments={comments.map((c) => ({
        id: c.id,
        body: c.body,
        authorName: c.author.name,
        authorAvatar: c.author.avatarUrl,
        createdAt: c.createdAt,
        parentId: c.parentId,
        likes: likeCount.get(c.id) ?? 0,
        likedByMe: likedByMe.has(c.id),
      }))}
    />
  );

  // ----- Blog: editorial / magazine article layout -----
  if (space.type === "BLOG") {
    const tSpace = await getTranslations("spaces");
    const RELATED_WHERE = {
      tenantId: tenant.id,
      spaceId: space.id,
      isPublished: true,
      id: { not: post.id },
      // Geplante Beitraege gehoeren erst ab ihrem Termin in die Reihen —
      // sonst verrieten die Kacheln, was noch kommt.
      ...(isStaff ? {} : { publishedAt: { lte: new Date() } }),
    } as const;
    const RELATED_SELECT = {
      id: true,
      title: true,
      body: true,
      imageUrl: true,
      videoUrl: true,
      teaserUrl: true,
      currency: true,
      createdAt: true,
      ...GATE_SELECT,
      _count: { select: { reactions: true, comments: true } },
    } as const;

    const [authorMembership, relatedRaw, popularRaw] = await Promise.all([
      prisma.membership.findFirst({
        where: {
          tenantId: tenant.id,
          userId: post.author.id,
          status: "ACTIVE",
        },
        select: { bio: true, role: true },
      }),
      // Zwei Reihen aus demselben Space: die neuesten anderen Beitraege und
      // die mit den meisten Likes. Bewusst nicht gegeneinander entdoppelt —
      // in einem jungen Blog waere die zweite Reihe sonst immer leer.
      prisma.post.findMany({
        where: RELATED_WHERE,
        orderBy: { createdAt: "desc" },
        take: 9,
        select: RELATED_SELECT,
      }),
      prisma.post.findMany({
        where: RELATED_WHERE,
        orderBy: { reactions: { _count: "desc" } },
        take: 9,
        select: RELATED_SELECT,
      }),
    ]);

    // Cover-Bilder liegen in den Post-Settings, nicht auf dem Post.
    const relatedCovers = await getPostSettingsForPosts(
      tenant.id,
      [...relatedRaw, ...popularRaw].map((p) => p.id),
    );

    const toTile = (p: (typeof relatedRaw)[number]): PostTileData => {
      // Bezahlte Beitraege bleiben sichtbar, aber verschlossen: der Anreiz
      // liegt genau darin, dass man sieht, was es noch gibt.
      const kind = postLockKind(p, ctx);
      const tileLocked = kind !== "none";
      const cover = relatedCovers.get(p.id);
      return {
        id: p.id,
        title:
          p.title ||
          (tileLocked
            ? tPostTile(kind === "paid" ? "paidUntitled" : "lockedUntitled")
            : excerpt(p.body, 80) || tSpace("untitled")),
        href: `/c/${slug}/s/${spaceSlug}/${p.id}`,
        // Mitglieder-Beitraege behalten ihr Titelbild — es ist die Werbung.
        // Beim Einzelverkauf steht dafuer nur das Vorschaubild bereit.
        imageUrl: kind === "paid" ? p.teaserUrl : p.imageUrl,
        videoUrl: tileLocked ? null : p.videoUrl,
        coverUrl: kind === "paid" ? null : (cover?.coverUrl ?? null),
        coverOffsetX: cover?.coverOffsetX ?? 50,
        coverOffsetY: cover?.coverOffsetY ?? 50,
        coverZoom: cover?.coverZoom ?? 100,
        hasVideo: Boolean(p.videoUrl),
        locked: tileLocked,
        lockKind: kind,
        priceLabel:
          kind === "paid" ? formatPrice(p.priceCents, p.currency, locale) : null,
        createdAt: p.createdAt,
        likes: p._count.reactions,
        comments: p._count.comments,
      };
    };

    // Gesperrt heisst nicht bildlos: das Titelbild bleibt stehen, nur
    // unkenntlich. Beim Einzelverkauf tritt das Vorschaubild an seine Stelle.
    const heroUrl = locked
      ? post.priceCents > 0
        ? post.teaserUrl
        : post.imageUrl
      : post.imageUrl;

    const similarTiles = relatedRaw.map(toTile);
    // Ohne Likes ist "beliebt" eine leere Behauptung — dann faellt die Reihe weg.
    const popularTiles = popularRaw.map(toTile).filter((p) => p.likes > 0);
    const spaceHref = `/c/${slug}/s/${spaceSlug}`;

    return (
      <article className="mx-auto max-w-3xl">
        {notice}
        <div className="mb-6">
          <Link
            href={`/c/${slug}/s/${spaceSlug}`}
            className="inline-flex items-center gap-1.5 text-sm text-[#161613]/60 transition hover:text-[#161613]"
          >
            <Icon name="chevron" size={14} className="rotate-90" />
            {space.name}
          </Link>
        </div>

        {/* Header */}
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#161613]/65">
            <span className="text-[color:var(--brand)]">{space.name}</span>
            <span className="mx-2" aria-hidden>·</span>
            {formatDate(post.createdAt, locale)}
            <span className="mx-2" aria-hidden>·</span>
            von {post.author.name}
            <span className="mx-2" aria-hidden>·</span>
            {post._count.comments}{" "}
            {post._count.comments === 1 ? "Kommentar" : "Kommentare"}
          </p>
          <h1 className="blog-title mx-auto mt-4 max-w-2xl text-4xl font-bold leading-[1.12] text-[#161613] sm:text-5xl">
            {post.title ||
              (locked
                ? tPostTile(post.priceCents > 0 ? "paidUntitled" : "lockedUntitled")
                : excerpt(post.body, 80) || tSpace("untitled"))}
          </h1>
        </header>

        {/* Hero image — gesperrt nur verwischt.
            Beim Einzelverkauf steht ohnehin nur das Vorschaubild bereit; das
            Original wird gar nicht erst ausgeliefert. Bei "nur fuer Mitglieder"
            bleibt das Titelbild die Werbung, aber unkenntlich. */}
        {heroUrl && (
          <div className="mt-9 overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroUrl}
              alt=""
              className={
                locked ? "w-full scale-105 object-cover" : "w-full object-cover"
              }
              // Das Titelbild eines Artikels ist breit — 16px wie auf einer
              // Kachel wuerden hier kaum etwas verbergen.
              style={locked ? { filter: "blur(44px)" } : undefined}
            />
          </div>
        )}
        {post.videoUrl && !heroUrl && !locked && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={post.videoUrl}
            controls
            preload="metadata"
            className="mt-9 w-full rounded-lg bg-black"
          />
        )}

        {/* Body */}
        <div className="mt-10">
          {locked ? (
            <div className="rounded-2xl border border-[#161613]/10 bg-[#161613]/[0.03] p-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#161613]/70 text-white">
                <Icon name="lock" size={22} />
              </span>
              <p className="mt-4 text-sm text-[#161613]/70">
                {post.priceCents > 0 ? tPostTile("paidHint") : tPostTile("lockedHint")}
              </p>
              {post.priceCents > 0 ? (
                <form action={purchasePostAction} className="mx-auto mt-5 max-w-xs">
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="space" value={spaceSlug} />
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="returnTo" value="post" />
                  <ImmediateAccessConsent className="mb-3" />
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.99]">
                    <Icon name="lock" size={16} />
                    {t("unlockFor", { price: formatPrice(post.priceCents, post.currency, locale) })}
                  </button>
                </form>
              ) : (
                /* Ohne Preis gibt es nichts zu kaufen — dieser Beitrag will eine
                   Mitgliedschaft. Ein Kauf-Button waere hier eine Sackgasse. */
                <Link
                  href={`/c/${slug}/join?next=${encodeURIComponent(selfHref)}`}
                  className="mx-auto mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)]"
                >
                  <Icon name="members" size={16} />
                  {tSpace("joinToRead")}
                </Link>
              )}
            </div>
          ) : post.bodyHtml ? (
            <div
              className="blog-article"
              dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
            />
          ) : (
            <div className="blog-article whitespace-pre-wrap">{post.body}</div>
          )}
        </div>

        {/* Share */}
        <div className="mt-10 border-y border-[#161613]/10 py-5">
          <ArticleShare title={post.title ?? space.name} />
        </div>

        {/* Author box */}
        <div className="mt-8 flex items-start gap-4 rounded-2xl bg-[#161613]/[0.03] p-6">
          <Avatar name={post.author.name} src={post.author.avatarUrl} size={56} />
          <div className="min-w-0">
            <p className="font-semibold text-[#161613]">{post.author.name}</p>
            <p className="mt-1 text-sm leading-relaxed text-[#161613]/70">
              {authorMembership?.bio?.trim()
                ? authorMembership.bio
                : `Autor:in bei ${tenant.name}.`}
            </p>
          </div>
        </div>

        {/* Comments */}
        <div className="mt-12">{commentsBlock}</div>

        {/* Weitere Beitraege aus diesem Space — bewusst unter den Kommentaren:
            wer bis hierhin gelesen hat, ist mit dem Artikel fertig. Darueber
            haetten die Reihen die Diskussion nach unten gedrueckt. */}
        {(similarTiles.length > 0 || popularTiles.length > 0) && (
          <div className="mt-14 space-y-12">
            {similarTiles.length > 0 && (
              <PostSlider
                title={tSpace("similarPosts")}
                titleHref={spaceHref}
                items={similarTiles}
              />
            )}
            {popularTiles.length > 0 && (
              <PostSlider
                title={tSpace("popularPosts")}
                titleHref={spaceHref}
                items={popularTiles}
              />
            )}
          </div>
        )}

      </article>
    );
  }

  const card: PostCardData = {
    id: post.id,
    title:
      post.title ||
      (locked ? tPostTile(post.priceCents > 0 ? "paidUntitled" : "lockedUntitled") : null),
    body: locked ? "" : post.body,
    bodyHtml: locked ? null : post.bodyHtml,
    imageUrl: locked ? null : post.imageUrl,
    imageUrls: locked ? [] : post.imageUrls,
    videoUrl: locked ? null : post.videoUrl,
    createdAt: post.createdAt,
    author: post.author,
    likes: post._count.reactions,
    comments: post._count.comments,
    likedByMe: post.reactions.length > 0,
    locked,
    lockedPreviewUrl: locked
      ? post.priceCents > 0
        ? post.teaserUrl
        : (post.imageUrls[0] ?? post.imageUrl)
      : null,
    // Kein Textauszug: ein kurzer Beitrag waere sonst ganz lesbar.
    lockedExcerpt: null,
    priceCents: post.priceCents,
    currency: post.currency,
    teaserUrl: post.teaserUrl,
  };

  // Weitere Beitraege desselben Space — unter den Kommentaren, wie im Blog:
  // wer bis hierhin gelesen hat, ist mit dem Beitrag fertig.
  const moreRaw = await prisma.post.findMany({
    where: {
      tenantId: tenant.id,
      spaceId: space.id,
      isPublished: true,
      id: { not: post.id },
      ...(isStaff ? {} : { publishedAt: { lte: new Date() } }),
    },
    orderBy: { createdAt: "desc" },
    take: 9,
    select: {
      id: true,
      title: true,
      body: true,
      imageUrl: true,
      imageUrls: true,
      videoUrl: true,
      teaserUrl: true,
      currency: true,
      createdAt: true,
      ...GATE_SELECT,
      _count: { select: { reactions: true, comments: true } },
    },
  });
  const moreTiles: PostTileData[] = moreRaw.map((p) => {
    const kind = postLockKind(p, ctx);
    const tileLocked = kind !== "none";
    return {
      id: p.id,
      title:
        p.title ||
        (tileLocked
          ? tPostTile(kind === "paid" ? "paidUntitled" : "lockedUntitled")
          : excerpt(p.body, 80) || t("untitled")),
      href: `/c/${slug}/s/${spaceSlug}/${p.id}`,
      imageUrl: kind === "paid" ? p.teaserUrl : (p.imageUrls[0] ?? p.imageUrl),
      videoUrl: tileLocked ? null : p.videoUrl,
      coverUrl: null,
      hasVideo: Boolean(p.videoUrl),
      locked: tileLocked,
      lockKind: kind,
      priceLabel: kind === "paid" ? formatPrice(p.priceCents, p.currency, locale) : null,
      createdAt: p.createdAt,
      likes: p._count.reactions,
      comments: p._count.comments,
    };
  });

  return (
    <div
      data-wide
      className="mx-auto max-w-[var(--feed-width)] space-y-5"
    >
      <Link
        href={`/c/${slug}/s/${spaceSlug}`}
        className="text-sm text-[#161613]/70 hover:text-[#161613]"
      >
        ← {t("backToSpace", { name: space.name })}
      </Link>
      {notice}
      <PostCard post={card} slug={slug} space={spaceSlug} detail />
      {commentsBlock}
      {moreTiles.length > 0 && (
        <div className="pt-6">
          <PostSlider
            title={t("morePosts", { space: space.name })}
            titleHref={`/c/${slug}/s/${spaceSlug}`}
            items={moreTiles}
          />
        </div>
      )}
    </div>
  );
}
