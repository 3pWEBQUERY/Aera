import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/misc";
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
  videoUrl?: string | null;
  createdAt: Date;
  author: { name: string; avatarUrl: string | null };
  likes: number;
  comments: number;
  likedByMe: boolean;
  /** Pay-per-post: locked for the current viewer (body/media withheld). */
  locked?: boolean;
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
  const locale = useLocale();
  const href = `/c/${slug}/s/${space}/${post.id}`;

  if (post.locked) {
    return (
      <article className="rounded-xl border border-[#161613]/10 bg-white p-5">
        <div className="flex items-center gap-3">
          <Avatar name={post.author.name} src={post.author.avatarUrl} size={36} />
          <div>
            <p className="text-sm font-medium text-[#161613]">{post.author.name}</p>
            <p className="text-xs text-[#161613]/50">{timeAgo(post.createdAt, locale)}</p>
          </div>
        </div>
        {post.title && <h2 className="display-serif mt-3 text-xl text-[#161613]">{post.title}</h2>}
        <div
          className="relative mt-3 w-full overflow-hidden rounded-xl border border-[#161613]/10 bg-[#161613]/5"
          style={{ aspectRatio: "16 / 9" }}
        >
          {post.teaserUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.teaserUrl} alt="" className="absolute inset-0 h-full w-full object-cover blur-lg" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#161613]/40 text-white">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#161613]/70">
              <Icon name="lock" size={22} />
            </span>
            <form action={purchasePostAction}>
              <input type="hidden" name="tenant" value={slug} />
              <input type="hidden" name="space" value={space} />
              <input type="hidden" name="postId" value={post.id} />
              <ImmediateAccessConsent inverse className="mb-2 max-w-xs" />
              <button className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#161613] transition hover:bg-white/90 active:scale-[0.99]">
                <Icon name="lock" size={15} />
                {t("unlockFor", { price: formatPrice(post.priceCents ?? 0, post.currency ?? PLATFORM_CURRENCY, locale) })}
              </button>
            </form>
          </div>
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
      {post.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.imageUrl} alt="" className="mt-3 max-h-[28rem] w-full rounded-xl border border-[#161613]/10 object-cover" />
      )}
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
