"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toggleReactionAction } from "@/app/actions/engage";
import { CommentThread, type ThreadComment } from "./comment-thread";
import { PostImages } from "./post-card";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { cn, timeAgo } from "@/lib/utils";

/**
 * Der Feed eines FEED-Space auf der Community-Startseite.
 *
 * Anders als die Kachelreihen daneben ist das eine Lesefläche: ein Beitrag
 * unter dem anderen, Medien gross, Kommentare direkt darunter aufklappbar.
 * Sortierung und Suche laufen im Browser ueber die bereits geladenen
 * Beitraege — ein Feed dieser Laenge passt in eine Antwort, und eine
 * Serverrunde pro Tastendruck waere fuer nichts.
 */

export interface FeedPostData {
  id: string;
  href: string;
  title: string | null;
  body: string;
  createdAt: string;
  images: string[];
  videoUrl: string | null;
  authorName: string;
  authorAvatar: string | null;
  likes: number;
  likedByMe: boolean;
  commentCount: number;
  lockKind: "none" | "members" | "paid";
  /** Fertig formatierter Preis fuer die Schaltflaeche eines Einzelverkaufs. */
  priceLabel: string | null;
  comments: ThreadComment[];
}

export function FeedStream({
  slug,
  spaceSlug,
  spaceName,
  communityName,
  posts,
  isMember,
  locale,
}: {
  slug: string;
  spaceSlug: string;
  spaceName: string;
  communityName: string;
  posts: FeedPostData[];
  isMember: boolean;
  locale: string;
}) {
  const t = useTranslations("community.render.feed");
  const [newestFirst, setNewestFirst] = useState(true);
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? posts.filter(
          (p) =>
            (p.title ?? "").toLowerCase().includes(q) || p.body.toLowerCase().includes(q),
        )
      : posts;
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return newestFirst ? sorted.reverse() : sorted;
  }, [posts, query, newestFirst]);

  return (
    <section>
      <h2 className="display-serif text-center text-2xl text-[#161613] sm:text-3xl">
        {t("heading", { name: communityName })}
      </h2>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={() => setNewestFirst((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#161613]/15 bg-white px-3.5 py-2.5 text-sm font-semibold text-[#161613] transition hover:border-[#161613]/35"
        >
          <Icon name="sort" size={16} />
          {newestFirst ? t("sortNewest") : t("sortOldest")}
        </button>
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#161613]/40"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-xl border border-transparent bg-[#161613]/[0.05] py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[#161613]/20 focus:bg-white"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 text-center text-sm text-[#161613]/50">
          {query.trim() ? t("noResults", { q: query.trim() }) : t("empty")}
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {shown.map((post) => (
            <FeedCard
              key={post.id}
              post={post}
              slug={slug}
              spaceSlug={spaceSlug}
              isMember={isMember}
              locale={locale}
            />
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link
          href={`/c/${slug}/s/${spaceSlug}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#161613]/70 transition-colors hover:gap-2.5 hover:text-[#161613]"
        >
          {t("allPosts", { space: spaceName })}
          <Icon name="arrowRight" size={15} />
        </Link>
      </div>
    </section>
  );
}

function FeedCard({
  post,
  slug,
  spaceSlug,
  isMember,
  locale,
}: {
  post: FeedPostData;
  slug: string;
  spaceSlug: string;
  isMember: boolean;
  locale: string;
}) {
  const t = useTranslations("community.render.feed");
  const [openComments, setOpenComments] = useState(false);
  const locked = post.lockKind !== "none";

  return (
    <article className="overflow-hidden rounded-2xl border border-[#161613]/10 bg-white">
      <div className="flex items-center gap-2.5 px-4 pt-4 sm:px-5">
        <Avatar name={post.authorName} src={post.authorAvatar} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#161613]">{post.authorName}</p>
          <p className="text-xs text-[#161613]/45">{timeAgo(post.createdAt, locale)}</p>
        </div>
        {locked && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#161613]/[0.06] px-2.5 py-1.5 text-xs font-semibold text-[#161613]/70">
            <Icon name="lock" size={13} />
            {post.lockKind === "paid" && post.priceLabel ? post.priceLabel : t("locked")}
          </span>
        )}
      </div>

      <div className="px-4 sm:px-5">
        {post.videoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={post.videoUrl}
            controls
            preload="metadata"
            className="mt-3 w-full rounded-xl border border-[#161613]/10 bg-black"
          />
        ) : (
          <PostImages urls={post.images} locked={locked} />
        )}

        {post.title && (
          <h3 className="mt-3.5 text-xl font-bold leading-snug text-[#161613] sm:text-2xl">
            {locked ? (
              post.title
            ) : (
              <Link href={post.href} className="transition hover:opacity-70">
                {post.title}
              </Link>
            )}
          </h3>
        )}

        {post.body && (
          <p
            className={cn(
              "mt-2 whitespace-pre-wrap text-[15px] leading-7 text-[#161613]/80",
              // Gesperrt: der Anfang bleibt lesbar, der Rest wird unkenntlich.
              // Das ist eine Anzeige-Entscheidung — der Server liefert bei
              // gesperrten Beitraegen ohnehin nur den Auszug aus.
              locked && "select-none blur-[5px]",
            )}
          >
            {post.body}
          </p>
        )}

        {locked && (
          <Link
            href={`/c/${slug}/join`}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)]"
          >
            <Icon name="lock" size={15} />
            {post.lockKind === "paid" && post.priceLabel
              ? t("unlockFor", { price: post.priceLabel })
              : t("joinToUnlock")}
          </Link>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-[#161613]/10 px-2 py-1.5 sm:px-3">
        <form action={toggleReactionAction}>
          <input type="hidden" name="tenant" value={slug} />
          <input type="hidden" name="space" value={spaceSlug} />
          <input type="hidden" name="postId" value={post.id} />
          <button
            type="submit"
            aria-pressed={post.likedByMe}
            aria-label={post.likedByMe ? t("unlike") : t("like")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition hover:bg-[#161613]/5",
              post.likedByMe ? "text-[var(--action-strong)]" : "text-[#161613]/60",
            )}
          >
            <Icon name="heart" size={17} fill={post.likedByMe ? "currentColor" : "none"} />
            {post.likes > 0 && post.likes}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setOpenComments((v) => !v)}
          aria-expanded={openComments}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[#161613]/60 transition hover:bg-[#161613]/5"
        >
          <Icon name="forum" size={17} />
          {post.commentCount > 0 && post.commentCount}
        </button>

        <ShareButton url={post.href} label={t("share")} copied={t("copied")} />

        <span className="flex-1" />

        {!locked && (
          <Link
            href={post.href}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[#161613]/60 transition hover:bg-[#161613]/5"
          >
            {t("openPost")}
            <Icon name="arrowRight" size={15} />
          </Link>
        )}
      </div>

      {openComments && (
        <div className="border-t border-[#161613]/10 bg-[#161613]/[0.02] px-4 py-4 sm:px-5">
          <CommentThread
            slug={slug}
            spaceSlug={spaceSlug}
            postId={post.id}
            isMember={isMember}
            comments={post.comments}
          />
        </div>
      )}
    </article>
  );
}

/** Teilen — Systemdialog, sonst Adresse in die Zwischenablage. */
function ShareButton({
  url,
  label,
  copied: copiedLabel,
}: {
  url: string;
  label: string;
  copied: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const absolute = `${window.location.origin}${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ url: absolute });
        return;
      }
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Abgebrochen oder keine Zwischenablage — nichts zu melden.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[#161613]/60 transition hover:bg-[#161613]/5"
    >
      <Icon name={copied ? "check" : "share"} size={17} />
      {copied ? copiedLabel : label}
    </button>
  );
}
