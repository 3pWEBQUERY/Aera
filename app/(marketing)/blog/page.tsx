import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Reveal } from "@/components/marketing/reveal";
import { PostCard, FeaturedCard } from "@/components/marketing/blog-card";
import { BLOG_CATEGORIES, POSTS_PER_PAGE, isBlogCategory } from "@/lib/blog";
import { featuredPost, listPosts, resolveBlogLocale, usedCategories } from "@/lib/blog-query";
import { env } from "@/lib/env";

export async function generateMetadata() {
  const t = await getTranslations("blog");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      canonical: `${env.APP_URL}/blog`,
      types: { "application/rss+xml": `${env.APP_URL}/blog/rss.xml` },
    },
  };
}

/**
 * Der Blog von Aera.
 *
 * Ein Aufmacher, darunter ein Raster — die Aufteilung, die jede Redaktion
 * benutzt, weil sie funktioniert: eine Sache ist wichtiger als der Rest, und
 * das sieht man, ohne es zu lesen.
 *
 * Der Aufmacher steht nur auf der ersten Seite und nur ohne Rubrikfilter. Wer
 * nach „Produkt" filtert, will die Produktbeitraege sehen und nicht wieder den
 * Beitrag, der ohnehin ueberall oben steht.
 */
export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ rubrik?: string; seite?: string }>;
}) {
  const { rubrik, seite } = await searchParams;
  const t = await getTranslations("blog");
  const uiLocale = await getLocale();

  const category = isBlogCategory(rubrik) ? rubrik : null;
  const page = Math.max(1, Number(seite) || 1);
  const locale = await resolveBlogLocale(uiLocale);

  if (!locale) return <EmptyBlog t={t} />;

  const showFeatured = page === 1 && !category;
  const featured = showFeatured ? await featuredPost(locale) : null;
  const [{ posts, total }, used] = await Promise.all([
    listPosts({
      locale,
      category,
      skip: (page - 1) * POSTS_PER_PAGE,
      take: POSTS_PER_PAGE,
      excludeIds: featured ? [featured.id] : [],
    }),
    usedCategories(locale),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  const href = (next: { rubrik?: string | null; seite?: number }) => {
    const params = new URLSearchParams();
    const nextCategory = next.rubrik === undefined ? category : next.rubrik;
    if (nextCategory) params.set("rubrik", nextCategory);
    if (next.seite && next.seite > 1) params.set("seite", String(next.seite));
    const query = params.toString();
    return query ? `/blog?${query}` : "/blog";
  };

  return (
    <main className="bg-[#f4f1ea] text-[#161613]">
      <div className="mx-auto max-w-7xl px-5 pb-24 pt-16 md:pt-24">
        <div className="max-w-3xl">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/50 sm:text-sm">
              {t("eyebrow")}
            </p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="display-serif mt-5 text-5xl leading-[1.04] sm:text-6xl md:text-7xl">
              {t("titleA")}
              <br />
              <span className="text-[#161613]/50">{t("titleB")}</span>
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#161613]/70">{t("intro")}</p>
          </Reveal>
        </div>

        {/* Rubriken — nur die, unter denen tatsaechlich etwas steht. Ein Filter,
            der auf eine leere Seite fuehrt, ist schlechter als kein Filter. */}
        {used.size > 0 && (
          <Reveal delay={300}>
            <nav
              aria-label={t("filterAria")}
              className="mt-12 flex flex-wrap items-center gap-2"
            >
              <FilterPill href={href({ rubrik: null, seite: 1 })} active={!category}>
                {t("all")}
              </FilterPill>
              {BLOG_CATEGORIES.filter((key) => used.has(key)).map((key) => (
                <FilterPill
                  key={key}
                  href={href({ rubrik: key, seite: 1 })}
                  active={category === key}
                >
                  {t(`categories.${key}`)}
                </FilterPill>
              ))}
            </nav>
          </Reveal>
        )}

        {featured && (
          <Reveal delay={360} className="mt-12">
            <FeaturedCard post={featured} locale={uiLocale} />
          </Reveal>
        )}

        {posts.length === 0 && !featured ? (
          <p className="mt-16 text-lg text-[#161613]/50">{t("emptyCategory")}</p>
        ) : (
          <div className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <Reveal key={post.id} delay={Math.min(index, 5) * 80}>
                <PostCard post={post} locale={uiLocale} />
              </Reveal>
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <nav
            aria-label={t("paginationAria")}
            className="mt-16 flex items-center justify-between gap-4 border-t border-[#161613]/10 pt-8"
          >
            <PageLink href={href({ seite: page - 1 })} disabled={page <= 1}>
              {t("previous")}
            </PageLink>
            <span className="text-sm text-[#161613]/50">
              {t("pageOf", { page, pages: pageCount })}
            </span>
            <PageLink href={href({ seite: page + 1 })} disabled={page >= pageCount}>
              {t("next")}
            </PageLink>
          </nav>
        )}
      </div>
    </main>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${
        active
          ? "bg-[#161613] text-white"
          : "border border-[#161613]/20 text-[#161613]/70 hover:border-[#161613]/50 hover:text-[#161613]"
      }`}
    >
      {children}
    </Link>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-sm font-semibold text-[#161613]/25">{children}</span>;
  }
  return (
    <Link
      href={href}
      className="text-sm font-semibold text-[#161613] underline decoration-[#161613]/30 underline-offset-4 transition hover:decoration-[#161613]"
    >
      {children}
    </Link>
  );
}

/**
 * Der Blog, bevor es einen Beitrag gibt.
 *
 * Keine leere Seite und kein „Fehler" — es ist ja keiner. Nur die Ansage, dass
 * hier gleich etwas steht.
 */
function EmptyBlog({ t }: { t: Awaited<ReturnType<typeof getTranslations<"blog">>> }) {
  return (
    <main className="bg-[#f4f1ea] text-[#161613]">
      <div className="mx-auto max-w-7xl px-5 pb-32 pt-16 md:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/50 sm:text-sm">
          {t("eyebrow")}
        </p>
        <h1 className="display-serif mt-5 max-w-2xl text-5xl leading-[1.04] sm:text-6xl">
          {t("emptyTitle")}
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-8 text-[#161613]/70">{t("emptyText")}</p>
      </div>
    </main>
  );
}
