import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPlatformAdminAccess } from "@/lib/platform-admin";
import { findPostBySlug, relatedPosts } from "@/lib/blog-query";
import { PostCard } from "@/components/marketing/blog-card";
import { isBlogCategory, isScheduled } from "@/lib/blog";
import { Avatar } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { env } from "@/lib/env";

/**
 * Ein Beitrag.
 *
 * Eine Spalte, hoechstens 44 Zeichen breit gesetzt, nichts daneben. Das ist
 * keine Sparsamkeit, sondern der ganze Zweck der Seite: hier wird gelesen.
 * Alles, was ablenkt — Newsletterkasten, Weiterlesen-Kaestchen mitten im Text,
 * Teilen-Leiste, die mitscrollt — steht deshalb hinter dem Text und nicht in
 * ihm.
 */

/**
 * Darf diese Person Unveroeffentlichtes sehen?
 *
 * Nur Plattform-Admins, und ausschliesslich zum Ansehen: ein Entwurf soll sich
 * pruefen lassen, ohne dass man ihn dafuer erst oeffentlich machen muss. Fuer
 * alle anderen existiert er nicht — inklusive 404 statt 403, damit die Adresse
 * eines Entwurfs nichts verraet.
 */
async function mayPreview(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && hasPlatformAdminAccess(user));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const post = await findPostBySlug({
    slug,
    locale,
    includeUnpublished: await mayPreview(),
  });
  if (!post) return {};

  const description = post.seoDescription ?? post.excerpt ?? undefined;
  const url = `${env.APP_URL}/blog/${post.slug}`;
  const image = post.coverUrl
    ? post.coverUrl.startsWith("http")
      ? post.coverUrl
      : `${env.APP_URL}${post.coverUrl}`
    : undefined;

  return {
    title: post.seoTitle ?? post.title,
    description,
    alternates: { canonical: url },
    // Ein Entwurf traegt `noindex` unabhaengig von der Einstellung: die
    // Vorschau ist fuer Menschen gedacht, nicht fuer Suchmaschinen.
    robots:
      post.noindex || post.status !== "PUBLISHED" ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "article",
      title: post.seoTitle ?? post.title,
      description,
      url,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: post.seoTitle ?? post.title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const uiLocale = await getLocale();
  const t = await getTranslations("blog");

  const preview = await mayPreview();
  const post = await findPostBySlug({ slug, locale: uiLocale, includeUnpublished: preview });
  if (!post) notFound();

  const scheduled = isScheduled(post);
  const hidden = post.status !== "PUBLISHED" || scheduled;
  const related = await relatedPosts({
    locale: post.locale,
    excludeId: post.id,
    category: post.category,
    take: 3,
  });

  const url = `${env.APP_URL}/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(post.coverUrl
      ? { image: post.coverUrl.startsWith("http") ? post.coverUrl : `${env.APP_URL}${post.coverUrl}` }
      : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt.toISOString() } : {}),
    dateModified: post.updatedAt.toISOString(),
    ...(post.author?.name ? { author: { "@type": "Person", name: post.author.name } } : {}),
    publisher: { "@type": "Organization", name: "Aera" },
    mainEntityOfPage: url,
    inLanguage: post.locale,
  };

  return (
    <main className="bg-[#f4f1ea] text-[#161613]">
      {/* Nur für Suchmaschinen; der Inhalt steht ohnehin sichtbar darunter. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-3xl px-5 pb-20 pt-12 md:pt-16">
        <Link
          href="/blog"
          className="text-sm font-semibold text-[#161613]/50 transition hover:text-[#161613]"
        >
          {t("backToBlog")}
        </Link>

        {/* Der Hinweis auf einen unveroeffentlichten Beitrag steht ganz oben und
            nicht klein am Rand: wer hier landet, soll nicht glauben, das sei
            die oeffentliche Seite. */}
        {hidden && (
          <p className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm text-amber-900">
            {scheduled && post.publishedAt
              ? t("previewScheduled", { date: formatDate(post.publishedAt, uiLocale) })
              : t("previewDraft")}
          </p>
        )}

        <header className="mt-8">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#161613]/45">
            {isBlogCategory(post.category) && (
              <>
                <Link
                  href={`/blog?rubrik=${post.category}`}
                  className="text-[#161613]/70 underline decoration-transparent underline-offset-4 transition hover:decoration-[#161613]/40"
                >
                  {t(`categories.${post.category}`)}
                </Link>
                <span aria-hidden>·</span>
              </>
            )}
            {post.publishedAt && (
              <>
                <time dateTime={post.publishedAt.toISOString()}>
                  {formatDate(post.publishedAt, uiLocale)}
                </time>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{t("readingTime", { minutes: post.readingMinutes })}</span>
          </p>

          <h1 className="display-serif mt-5 text-4xl leading-[1.06] sm:text-5xl md:text-6xl">
            {post.title}
          </h1>

          {post.excerpt && (
            <p className="mt-6 text-xl leading-9 text-[#161613]/70">{post.excerpt}</p>
          )}

          {post.author?.name && (
            <div className="mt-8 flex items-center gap-3 border-t border-[#161613]/10 pt-6">
              <Avatar name={post.author.name} src={post.author.avatarUrl} size={38} />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-[#161613]">{post.author.name}</p>
                <p className="text-[#161613]/50">{t("authorRole")}</p>
              </div>
            </div>
          )}
        </header>

        {post.coverUrl && (
          <figure className="mt-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.coverUrl}
              alt={post.coverAlt ?? ""}
              className="w-full rounded-2xl border border-[#161613]/8 object-cover"
            />
            {post.coverAlt && (
              <figcaption className="mt-3 text-sm text-[#161613]/50">{post.coverAlt}</figcaption>
            )}
          </figure>
        )}

        <div
          className="rich-content aera-post mt-10"
          // Der Inhalt wurde beim Speichern durch sanitizeRichHtml gefiltert
          // (lib/rich-text.ts) — das ist die Vertrauensgrenze, nicht diese Zeile.
          dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
        />
      </div>

      {related.length > 0 && (
        <section className="border-t border-[#161613]/10">
          <div className="mx-auto max-w-7xl px-5 py-16">
            <h2 className="display-serif text-3xl">{t("keepReading")}</h2>
            <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((entry) => (
                <PostCard key={entry.id} post={entry} locale={uiLocale} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
