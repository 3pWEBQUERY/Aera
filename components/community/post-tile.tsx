import Link from "next/link";
import { Icon } from "@/components/dashboard/icons";
import { Pill } from "@/components/ui/misc";
import { timeAgo } from "@/lib/utils";

export interface TileLabels {
  locale: string;
  memberLabel: string;
  exclusiveLabel: string;
}

export interface PostTileData {
  id: string;
  title: string;
  href: string;
  /** null for locked posts — media never leaks to non-entitled visitors. */
  imageUrl: string | null;
  /** null for locked posts (same reason) — used as an animated thumbnail. */
  videoUrl: string | null;
  hasVideo: boolean;
  /** Cover image with focal point + zoom; takes priority over imageUrl. */
  coverUrl?: string | null;
  coverOffsetX?: number;
  coverOffsetY?: number;
  coverZoom?: number;
  locked: boolean;
  createdAt: Date;
  likes: number;
  comments: number;
}

/**
 * Frosted-glass teaser for gated content. We never render the real media for
 * non-entitled visitors (the media proxy blocks it too), so this is a blurred
 * brand placeholder with a clear "become a member" call to action.
 */
function LockedTeaser({ compact = false, label }: { compact?: boolean; label: string }) {
  return (
    <>
      <div className="bg-[var(--brand)] absolute inset-0" />
      {/* Milk-glass layer so nothing is clearly recognizable. */}
      <div className="absolute inset-0 bg-white/10 backdrop-blur-md" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
        <span
          className={`flex items-center justify-center rounded-full bg-white/20 ring-1 ring-white/50 backdrop-blur-sm ${
            compact ? "h-9 w-9" : "h-11 w-11"
          }`}
        >
          <Icon name="lock" size={compact ? 16 : 20} />
        </span>
        <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm">
          {label}
        </span>
      </div>
    </>
  );
}

function Media({
  post,
  large = false,
  memberLabel,
}: {
  post: PostTileData;
  large?: boolean;
  memberLabel: string;
}) {
  return (
    <div className={`relative w-full overflow-hidden bg-[#161613]/5 ${large ? "" : "aspect-video"}`}>
      {post.locked ? (
        <LockedTeaser label={memberLabel} />
      ) : post.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.coverUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          style={{
            objectPosition: `${post.coverOffsetX ?? 50}% ${post.coverOffsetY ?? 50}%`,
            transform: (post.coverZoom ?? 100) > 100 ? `scale(${(post.coverZoom ?? 100) / 100})` : undefined,
            transformOrigin: `${post.coverOffsetX ?? 50}% ${post.coverOffsetY ?? 50}%`,
          }}
        />
      ) : post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="bg-[var(--brand)] absolute inset-0 opacity-90" />
      )}

      {post.hasVideo && !post.locked && (
        <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
          <Icon name="play" size={14} fill="currentColor" />
        </span>
      )}
    </div>
  );
}

function Meta({ post, locale }: { post: PostTileData; locale: string }) {
  return (
    <p className="mt-1.5 flex items-center gap-2.5 text-xs text-[#161613]/50">
      <span>{timeAgo(post.createdAt, locale)}</span>
      {post.likes > 0 && (
        <span className="inline-flex items-center gap-1">
          <Icon name="heart" size={12} /> {post.likes}
        </span>
      )}
      {post.comments > 0 && (
        <span className="inline-flex items-center gap-1">
          <Icon name="forum" size={12} /> {post.comments}
        </span>
      )}
    </p>
  );
}

/** Compact media tile for post grids (Patreon-style). */
export function PostTile({
  post,
  locale,
  memberLabel,
}: {
  post: PostTileData;
  locale: string;
  memberLabel: string;
}) {
  return (
    <Link
      href={post.href}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
    >
      <div className="overflow-hidden rounded-2xl border border-[#161613]/10 transition duration-300 group-hover:-translate-y-1 group-hover:border-[#161613]/25">
        <Media post={post} memberLabel={memberLabel} />
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug text-[#161613]">
        {post.title}
      </h3>
      <Meta post={post} locale={locale} />
    </Link>
  );
}

/**
 * Video tile — the video itself is the thumbnail (first frame via #t seek).
 * Locked videos show the frosted teaser instead and link to the join page.
 */
export function VideoTile({
  post,
  locale,
  memberLabel,
}: {
  post: PostTileData;
  locale: string;
  memberLabel: string;
}) {
  return (
    <Link
      href={post.href}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-[#161613]/10 bg-[#161613] transition duration-300 group-hover:-translate-y-1">
        {post.locked ? (
          <LockedTeaser label={memberLabel} />
        ) : post.videoUrl ? (
          <>
            <video
              // #t seeks to a frame so the poster renders without playing.
              src={`${post.videoUrl}#t=0.5`}
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/50 backdrop-blur-sm transition group-hover:scale-105">
                <Icon name="play" size={20} fill="currentColor" />
              </span>
            </span>
          </>
        ) : (
          <div className="bg-[var(--brand)] absolute inset-0" />
        )}
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug text-[#161613]">
        {post.title}
      </h3>
      <Meta post={post} locale={locale} />
    </Link>
  );
}

/** Large featured card ("Aktueller Post"). */
export function FeaturedPost({
  post,
  excerpt,
  locale,
  memberLabel,
  exclusiveLabel,
}: {
  post: PostTileData;
  excerpt?: string;
  locale: string;
  memberLabel: string;
  exclusiveLabel: string;
}) {
  return (
    <Link
      href={post.href}
      className="group block overflow-hidden rounded-2xl border border-[#161613]/10 bg-white transition duration-300 hover:-translate-y-1 hover:border-[#161613]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25 md:grid md:grid-cols-[1.1fr_1fr]"
    >
      <div className="relative aspect-video md:aspect-auto md:min-h-56">
        <Media post={post} large memberLabel={memberLabel} />
      </div>
      <div className="flex flex-col justify-center p-5 sm:p-6">
        {post.locked && (
          <div className="mb-2">
            <Pill className="bg-[#161613]/5 text-[#161613]/70">
              {exclusiveLabel}
            </Pill>
          </div>
        )}
        <h3 className="display-serif text-2xl leading-snug text-[#161613]">
          {post.title}
        </h3>
        {excerpt && !post.locked && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#161613]/60">{excerpt}</p>
        )}
        <Meta post={post} locale={locale} />
      </div>
    </Link>
  );
}
