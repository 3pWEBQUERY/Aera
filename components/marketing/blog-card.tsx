import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { BlogCard as BlogCardData } from "@/lib/blog-query";
import { isBlogCategory } from "@/lib/blog";
import { formatDate } from "@/lib/utils";

/**
 * Die Karten der Blog-Uebersicht.
 *
 * Zwei Groessen, ein Aufbau: Bild, Zeile mit Rubrik und Datum, Titel, Anriss.
 * Der Unterschied ist nur der Massstab — so bleibt der Aufmacher als „dasselbe,
 * nur wichtiger" lesbar und nicht als anderes Ding.
 *
 * Beide sind Server-Komponenten: eine Karte hat keinen Zustand, und die
 * Uebersetzungen holt sie sich selbst, statt sie durch drei Ebenen gereicht zu
 * bekommen.
 */

/**
 * Der Platzhalter fuer Beitraege ohne Bild.
 *
 * Kein graues Rechteck: eine leere Flaeche sieht nach fehlendem Inhalt aus.
 * Stattdessen dieselbe Tinte wie die Schrift, leicht abgestuft.
 *
 * Darauf steht die Rubrik und ausdruecklich NICHT der Titel. Der steht direkt
 * darunter — zweimal derselbe Satz uebereinander liest sich wie ein Fehler,
 * auch wenn beide Male Absicht dahintersteckt.
 */
const PLATE = "bg-[linear-gradient(135deg,#26261f_0%,#161613_60%,#33332e_100%)]";

async function Cover({
  post,
  large,
}: {
  post: BlogCardData;
  large: boolean;
}) {
  const t = await getTranslations("blog");
  const plateWord = isBlogCategory(post.category) ? t(`categories.${post.category}`) : "Aera";
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${large ? "aspect-[16/10]" : "aspect-[3/2]"} ${post.coverUrl ? "bg-[#161613]/5" : PLATE}`}
    >
      {post.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.coverUrl}
          alt={post.coverAlt ?? ""}
          loading={large ? "eager" : "lazy"}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <span
          aria-hidden
          className={`display-serif absolute inset-0 flex items-center justify-center ${large ? "text-5xl sm:text-6xl" : "text-3xl"} leading-none text-white/25`}
        >
          {plateWord}
        </span>
      )}
    </div>
  );
}

async function Meta({
  post,
  locale,
}: {
  post: BlogCardData;
  locale: string;
}) {
  const t = await getTranslations("blog");
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#161613]/45">
      {isBlogCategory(post.category) && (
        <>
          <span className="text-[#161613]/70">{t(`categories.${post.category}`)}</span>
          <span aria-hidden>·</span>
        </>
      )}
      {post.publishedAt && (
        <>
          <time dateTime={post.publishedAt.toISOString()}>
            {formatDate(post.publishedAt, locale)}
          </time>
          <span aria-hidden>·</span>
        </>
      )}
      <span>{t("readingTime", { minutes: post.readingMinutes })}</span>
    </p>
  );
}

export async function PostCard({
  post,
  locale,
}: {
  post: BlogCardData;
  locale: string;
}) {
  return (
    <article className="group h-full">
      <Link href={`/blog/${post.slug}`} className="flex h-full flex-col">
        <Cover post={post} large={false} />
        <div className="mt-5 flex min-w-0 flex-1 flex-col">
          <Meta post={post} locale={locale} />
          <h2 className="display-serif mt-3 text-2xl leading-[1.15] transition-colors duration-200 group-hover:text-[#161613]/65">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="mt-3 line-clamp-3 text-[15px] leading-7 text-[#161613]/65">
              {post.excerpt}
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}

export async function FeaturedCard({
  post,
  locale,
}: {
  post: BlogCardData;
  locale: string;
}) {
  const t = await getTranslations("blog");
  return (
    <article className="group">
      <Link
        href={`/blog/${post.slug}`}
        className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
      >
        <Cover post={post} large />
        <div className="min-w-0">
          <Meta post={post} locale={locale} />
          <h2 className="display-serif mt-4 text-4xl leading-[1.06] sm:text-5xl">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#161613]/70">{post.excerpt}</p>
          )}
          <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#161613] underline decoration-[#161613]/30 underline-offset-4 transition group-hover:decoration-[#161613]">
            {t("readMore")}
          </span>
        </div>
      </Link>
    </article>
  );
}
