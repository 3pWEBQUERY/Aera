import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { canAccess } from "@/lib/entitlements";
import { purchasePostAction } from "@/app/actions/engage";
import { PostCard, type PostCardData } from "@/components/community/post-card";
import { CommentForm } from "@/components/community/comment-form";
import { ForumThread } from "@/components/community/forum-thread";
import { ArticleShare } from "@/components/community/article-share";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { ImmediateAccessConsent } from "@/components/community/immediate-access-consent";
import { excerpt, formatDate, timeAgo } from "@/lib/utils";

export default async function PostDetail({
  params,
}: {
  params: Promise<{ slug: string; spaceSlug: string; postId: string }>;
}) {
  const { slug, spaceSlug, postId } = await params;
  const [t, locale] = await Promise.all([
    getTranslations("spaces"),
    getLocale(),
  ]);
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, user, ctx } = community;

  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, slug: spaceSlug },
  });
  if (!space || !canAccess(space, ctx)) notFound();

  // ----- Reddit-style forum thread -----
  if (space.type === "FORUM") {
    const fpost = await prisma.post.findFirst({
      where: { id: postId, tenantId: tenant.id, spaceId: space.id },
      include: {
        author: { select: { name: true, avatarUrl: true } },
        _count: { select: { comments: true } },
      },
    });
    if (!fpost) notFound();
    const fcomments = await prisma.comment.findMany({
      where: { tenantId: tenant.id, postId: fpost.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { name: true, avatarUrl: true } } },
    });
    const cIds = fcomments.map((c) => c.id);
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

    return (
      <ForumThread
        slug={slug}
        spaceSlug={spaceSlug}
        isMember={ctx.membership?.status === "ACTIVE"}
        post={{
          id: fpost.id,
          title: fpost.title,
          body: fpost.body,
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
    where: { id: postId, tenantId: tenant.id, spaceId: space.id },
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
  const isStaff = ctx.isStaff;
  if (!isStaff && (!post.isPublished || post.publishedAt.getTime() > Date.now())) {
    notFound();
  }

  // Pay-per-post gate: withhold body/media from non-buyers.
  const locked =
    post.priceCents > 0 &&
    !isStaff &&
    (!post.entitlementKey || !ctx.keys.has(post.entitlementKey));

  const comments = await prisma.comment.findMany({
    where: { tenantId: tenant.id, postId: post.id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true, avatarUrl: true } } },
  });

  const isMember = ctx.membership?.status === "ACTIVE";

  const commentsBlock = (
    <div className="rounded-xl border border-[#161613]/10 bg-white p-5">
      <h2 className="mb-4 font-semibold text-[#161613]">
        {t("commentCount", { count: comments.length })}
      </h2>
      <div className="space-y-4">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <Avatar name={c.author.name} src={c.author.avatarUrl} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#161613]">{c.author.name}</span>
                <span className="text-xs text-[#161613]/50">{timeAgo(c.createdAt, locale)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-[#161613]/80">{c.body}</p>
            </div>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-[#161613]/60">{t("noComments")}</p>
        )}
      </div>
      {isMember && (
        <div className="mt-5 border-t border-[#161613]/10 pt-4">
          <CommentForm slug={slug} space={spaceSlug} postId={post.id} />
        </div>
      )}
    </div>
  );

  // ----- Blog: editorial / magazine article layout -----
  if (space.type === "BLOG") {
    const [authorMembership, relatedRaw] = await Promise.all([
      prisma.membership.findFirst({
        where: {
          tenantId: tenant.id,
          userId: post.author.id,
          status: "ACTIVE",
        },
        select: { bio: true, role: true },
      }),
      prisma.post.findMany({
        where: {
          tenantId: tenant.id,
          spaceId: space.id,
          isPublished: true,
          id: { not: post.id },
        },
        orderBy: { createdAt: "desc" },
        take: 2,
        select: { id: true, title: true, body: true, imageUrl: true },
      }),
    ]);

    return (
      <article className="mx-auto max-w-3xl">
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
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#161613]/50">
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
            {post.title || excerpt(post.body, 80) || "Ohne Titel"}
          </h1>
        </header>

        {/* Hero image */}
        {post.imageUrl && (
          <div className="mt-9 overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.imageUrl} alt="" className="w-full object-cover" />
          </div>
        )}
        {post.videoUrl && !post.imageUrl && (
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
              <p className="mt-4 text-sm text-[#161613]/70">{excerpt(post.body, 160)}</p>
              <form action={purchasePostAction} className="mx-auto mt-5 max-w-xs">
                <input type="hidden" name="tenant" value={slug} />
                <input type="hidden" name="space" value={spaceSlug} />
                <input type="hidden" name="postId" value={post.id} />
                <ImmediateAccessConsent className="mb-3" />
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#161613] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#33332e] active:scale-[0.99]">
                  <Icon name="lock" size={16} />
                  {post.priceCents / 100} {post.currency.toUpperCase()}
                </button>
              </form>
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

        {/* Related posts */}
        {relatedRaw.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#161613]/50">
              Ähnliche Beiträge
            </h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {relatedRaw.map((r) => (
                <Link
                  key={r.id}
                  href={`/c/${slug}/s/${spaceSlug}/${r.id}`}
                  className="group block overflow-hidden rounded-xl border border-[#161613]/10 bg-white transition hover:border-[#161613]/25 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                >
                  <div className="aspect-[16/9] w-full overflow-hidden bg-[#161613]/5">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="bg-[var(--brand)] h-full w-full opacity-90" />
                    )}
                  </div>
                  <p className="blog-title px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide text-[#161613] group-hover:text-[color:var(--brand)]">
                    {r.title || excerpt(r.body, 60) || "Ohne Titel"}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Comments */}
        <div className="mt-12">{commentsBlock}</div>
      </article>
    );
  }

  const card: PostCardData = {
    id: post.id,
    title: post.title,
    body: locked ? "" : post.body,
    bodyHtml: locked ? null : post.bodyHtml,
    imageUrl: locked ? null : post.imageUrl,
    videoUrl: locked ? null : post.videoUrl,
    createdAt: post.createdAt,
    author: post.author,
    likes: post._count.reactions,
    comments: post._count.comments,
    likedByMe: post.reactions.length > 0,
    locked,
    priceCents: post.priceCents,
    currency: post.currency,
    teaserUrl: post.teaserUrl,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href={`/c/${slug}/s/${spaceSlug}`}
        className="text-sm text-[#161613]/60 hover:text-[#161613]"
      >
        ← Zurück zu {space.name}
      </Link>
      <PostCard post={card} slug={slug} space={spaceSlug} detail />
      {commentsBlock}
    </div>
  );
}
