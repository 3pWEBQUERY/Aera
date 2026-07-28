import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/misc";
import { PostImages } from "./post-images";
import { Icon } from "@/components/dashboard/icons";
import { toggleReactionAction, purchasePostAction } from "@/app/actions/engage";
import { timeAgo, excerpt, formatPrice } from "@/lib/utils";
import { ImmediateAccessConsent } from "@/components/community/immediate-access-consent";
import { PLATFORM_CURRENCY } from "@/lib/currency";

export interface PostCardData {
  id: string;
  title: string | null;
  body: string;
  bodyHtml?: string | null;
  imageUrl?: string | null;
  /** Alle Bilder in Anzeigereihenfolge; leer heisst: nur `imageUrl`. */
  imageUrls?: string[];
  videoUrl?: string | null;
  createdAt: Date;
  author: { name: string; avatarUrl: string | null };
  likes: number;
  comments: number;
  likedByMe: boolean;
  /** Pay-per-post: locked for the current viewer (body/media withheld). */
  locked?: boolean;
  /**
   * Was ein Gesperrter zu sehen bekommt: beim Einzelverkauf das eigens
   * gepflegte Vorschaubild, bei "nur fuer Mitglieder" das Titelbild — dort
   * ist es die Werbung fuer den Beitrag. Wird verwischt gezeigt.
   */
  lockedPreviewUrl?: string | null;
  /** Auszug, der bei gesperrten Beitraegen unkenntlich angerissen wird. */
  lockedExcerpt?: string | null;
  priceCents?: number;
  currency?: string;
  teaserUrl?: string | null;
}

export function PostCard({
  post,
  slug,
  space,
  detail,
}: {
  post: PostCardData;
  slug: string;
  space: string;
  detail?: boolean;
}) {
  const t = useTranslations("spaces");
  const tTile = useTranslations("community.render.postTile");
  const locale = useLocale();
  const href = `/c/${slug}/s/${space}/${post.id}`;

  if (post.locked) {
    // Ein Beitrag ohne Preis will keine Zahlung, sondern eine Mitgliedschaft.
    // Ein Kauf-Knopf waere dort eine Sackgasse — dieselbe Unterscheidung wie
    // im Blog.
    const paid = (post.priceCents ?? 0) > 0;
    return (
      <article className="overflow-hidden rounded-xl border border-[#161613]/10 bg-white">
        <div className="flex items-center gap-3 px-5 pt-5">
          <Avatar name={post.author.name} src={post.author.avatarUrl} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#161613]">{post.author.name}</p>
            <p className="text-xs text-[#161613]/50">{timeAgo(post.createdAt, locale)}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#161613]/[0.06] px-2.5 py-1.5 text-xs font-semibold text-[#161613]/70">
            <Icon name="lock" size={13} />
            {paid
              ? formatPrice(post.priceCents ?? 0, post.currency ?? PLATFORM_CURRENCY, locale)
              : tTile("locked")}
          </span>
        </div>

        <div className="px-5">
          <PostImages
            urls={post.lockedPreviewUrl ? [post.lockedPreviewUrl] : []}
            locked
          />

          {post.title && (
            <h2 className="display-serif mt-3 text-xl text-[#161613]">{post.title}</h2>
          )}

          {post.lockedExcerpt && (
            // Der Anfang bleibt lesbar, der Rest wird unkenntlich. Der volle
            // Text geht gar nicht erst ueber die Leitung — Verwischen allein
            // waere kein Schutz.
            <p className="mt-2 select-none whitespace-pre-wrap text-[15px] leading-7 text-[#161613]/80 blur-[5px]">
              {post.lockedExcerpt}
            </p>
          )}

          {paid ? (
            <form action={purchasePostAction} className="mt-4">
              <input type="hidden" name="tenant" value={slug} />
              <input type="hidden" name="space" value={space} />
              <input type="hidden" name="postId" value={post.id} />
              <ImmediateAccessConsent className="mb-3 max-w-md" />
              <button className="inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.99]">
                <Icon name="lock" size={15} />
                {t("unlockFor", {
                  price: formatPrice(post.priceCents ?? 0, post.currency ?? PLATFORM_CURRENCY, locale),
                })}
              </button>
            </form>
          ) : (
            <Link
              href={`/c/${slug}/join`}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)]"
            >
              <Icon name="members" size={15} />
              {t("joinToRead")}
            </Link>
          )}
        </div>

        <div className="mt-5 h-px w-full bg-[#161613]/10" />
        <div className="px-5 py-3 text-xs text-[#161613]/45">
          {t("commentCount", { count: post.comments })}
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-[#161613]/10 bg-white p-5">
      <div className="flex items-center gap-3">
        <Avatar name={post.author.name} src={post.author.avatarUrl} size={36} />
        <div>
          <p className="text-sm font-medium text-[#161613]">{post.author.name}</p>
          <p className="text-xs text-[#161613]/50">{timeAgo(post.createdAt, locale)}</p>
        </div>
      </div>
      {post.title &&
        (detail ? (
          <h1 className="display-serif mt-3 text-2xl text-[#161613]">{post.title}</h1>
        ) : (
          <Link href={href}>
            <h2 className="display-serif mt-3 text-xl text-[#161613]">
              {post.title}
            </h2>
          </Link>
        ))}
      {detail && post.bodyHtml ? (
        <div
          className="rich-content mt-3 text-[15px] text-[#161613]/80"
          dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
        />
      ) : (
        post.body && (
          <div className="prose-body mt-2 whitespace-pre-wrap text-[15px] text-[#161613]/80">
            {detail ? post.body : excerpt(post.body, 280)}
          </div>
        )
      )}
      <PostImages urls={post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : []} />
      {post.videoUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={post.videoUrl} controls preload="metadata" className="mt-3 w-full rounded-xl border border-[#161613]/10 bg-black" />
      )}
      <div className="mt-4 flex items-center gap-4 text-sm text-[#161613]/60">
        <form action={toggleReactionAction}>
          <input type="hidden" name="tenant" value={slug} />
          <input type="hidden" name="space" value={space} />
          <input type="hidden" name="postId" value={post.id} />
          <button
            aria-label={post.likedByMe ? t("unlike") : t("like")}
            aria-pressed={post.likedByMe}
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition hover:bg-[#161613]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] ${
              post.likedByMe ? "font-semibold text-[color:var(--brand)]" : ""
            }`}
          >
            <Icon
              name="heart"
              size={16}
              fill={post.likedByMe ? "currentColor" : "none"}
            />
            {post.likes}
          </button>
        </form>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition hover:bg-[#161613]/5 hover:text-[#161613]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          aria-label={t("commentCount", { count: post.comments })}
        >
          <Icon name="forum" size={16} />
          {post.comments}
        </Link>
      </div>
    </article>
  );
}

export { PostImages };
