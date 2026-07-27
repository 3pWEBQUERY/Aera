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
  /** "paid" zeigt den Preis auf der Plakette, "members" nur das Schloss. */
  lockKind?: "none" | "members" | "paid";
  /** Fertig formatierter Preis fuer die Plakette eines Einzelverkaufs. */
  priceLabel?: string | null;
  createdAt: Date;
  likes: number;
  comments: number;
}

/**
 * Titelplatte — die Kachel ohne Bild.
 *
 * Zwei Faelle teilen sich dieselbe Flaeche: ein gesperrter Beitrag (dessen
 * Medien wir gar nicht erst ausliefern) und ein Beitrag, fuer den der Creator
 * kein Titelbild gesetzt hat. Statt einer leeren Farbflaeche traegt sie den
 * Titel selbst — dadurch ist auch eine bildlose Reihe lesbar.
 *
 * Der Ton entsteht aus der Primaerfarbe der Community, aber immer in Richtung
 * Dunkel gemischt: weisse Schrift muss auf jeder Markenfarbe lesbar bleiben,
 * auch auf einem hellen Gelb.
 */
const PLATE_STYLE = {
  backgroundImage:
    "linear-gradient(135deg," +
    " color-mix(in oklab, var(--brand) 38%, #1b1520) 0%," +
    " color-mix(in oklab, var(--brand) 20%, #100d15) 100%)",
} as const;

function LockBadge({ post, label }: { post: PostTileData; label: string }) {
  return (
    <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-[#161613]/85 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
      <Icon name="lock" size={13} />
      {post.lockKind === "paid" && post.priceLabel ? post.priceLabel : label}
    </span>
  );
}

function TitlePlate({
  title,
  compact = false,
}: {
  title: string;
  compact?: boolean;
}) {
  return (
    <>
      <div className="absolute inset-0" style={PLATE_STYLE} />
      <div className={`absolute inset-0 flex flex-col justify-center ${compact ? "p-4" : "p-5 sm:p-6"}`}>
        {/* Der Titel wird geklammert und laeuft nach unten aus, statt hart
            abzuschneiden — dieselbe Anmutung wie ein echtes Coverbild. */}
        <p
          className={`line-clamp-3 font-semibold leading-tight text-white ${
            compact ? "text-base" : "text-lg sm:text-xl"
          }`}
          style={{
            maskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
          }}
        >
          {title}
        </p>
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
      {post.locked && !post.coverUrl && !post.imageUrl ? (
        <TitlePlate title={post.title} compact={!large} />
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
        <TitlePlate title={post.title} compact={!large} />
      )}

      {post.locked && <LockBadge post={post} label={memberLabel} />}

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
      <div className="overflow-hidden rounded-2xl border border-[#161613]/10 transition duration-300 group-hover:border-[#161613]/25">
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
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-[#161613]/10 bg-[#161613] transition duration-300 group-hover:border-[#161613]/25">
        {post.locked && !post.videoUrl && !post.coverUrl && !post.imageUrl ? (
          <TitlePlate title={post.title} compact />
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
        ) : post.coverUrl || post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={(post.coverUrl ?? post.imageUrl) as string}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <TitlePlate title={post.title} compact />
        )}
        {post.locked && <LockBadge post={post} label={memberLabel} />}
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
      className="group block overflow-hidden rounded-2xl border border-[#161613]/10 bg-white transition duration-300 hover:border-[#161613]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25 md:grid md:grid-cols-[1.1fr_1fr]"
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
