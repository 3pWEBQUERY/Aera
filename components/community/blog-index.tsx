import Link from "next/link";
import { Avatar, EmptyState, Pill } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import type { BlogSettings } from "@/lib/space-settings";
import { getLocale, getTranslations } from "next-intl/server";

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  authorName: string;
  authorAvatar: string | null;
  createdAt: Date;
  readMinutes: number;
  comments: number;
}

function Cover({ url, title, ratio }: { url: string | null; title: string; ratio: string }) {
  return (
    <div className="relative w-full overflow-hidden bg-[#161613]/5" style={{ aspectRatio: ratio }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={title} className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      ) : (
        <div className="bg-[var(--brand)] absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-white/90">{title.charAt(0).toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}

function Meta({ post, cfg, locale, readTime }: { post: BlogPost; cfg: BlogSettings; locale: string; readTime: string }) {
  if (!cfg.showAuthor && !cfg.showDate && !cfg.showReadTime) return null;
  return (
    <div className="mt-4 flex items-center gap-2 text-xs text-[#161613]/50">
      {cfg.showAuthor && (
        <>
          <Avatar name={post.authorName} src={post.authorAvatar} size={22} />
          <span className="font-medium text-[#161613]/70">{post.authorName}</span>
        </>
      )}
      {cfg.showAuthor && (cfg.showDate || cfg.showReadTime) && <span aria-hidden>·</span>}
      {cfg.showDate && <span>{new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(post.createdAt)}</span>}
      {cfg.showDate && cfg.showReadTime && <span aria-hidden>·</span>}
      {cfg.showReadTime && <span>{readTime}</span>}
    </div>
  );
}

function gridColsClass(columns: number) {
  return columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
}

export async function BlogIndex({
  slug,
  space,
  posts,
  settings,
  page,
  pageCount,
}: {
  slug: string;
  space: string;
  posts: BlogPost[];
  settings: BlogSettings;
  page: number;
  pageCount: number;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("uiMigration.frontend.blogIndex"),
    getLocale(),
  ]);
  if (posts.length === 0) {
    return <EmptyState icon="blog" title={t("emptyTitle")} hint={t("emptyHint")} />;
  }

  const cfg = settings;
  const href = (id: string) => `/c/${slug}/s/${space}/${id}`;
  const base = `/c/${slug}/s/${space}`;
  const pageHref = (n: number) => (n <= 1 ? base : `${base}?page=${n}`);

  // Magazine hero only on the first page.
  const useHero = cfg.layout === "MAGAZINE" && cfg.featured && page <= 1;
  const [hero, ...restAfterHero] = posts;
  const gridPosts = useHero ? restAfterHero : posts;

  const GridCard = ({ p }: { p: BlogPost }) => (
    <Link key={p.id} href={href(p.id)} className="group flex flex-col overflow-hidden rounded-2xl border border-[#161613]/10 bg-white transition hover:border-[#161613]/25 hover:shadow-md">
      {cfg.showCover && <Cover url={p.coverUrl} title={p.title} ratio="16 / 9" />}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="display-serif text-lg leading-snug text-[#161613]">{p.title}</h3>
        {cfg.showExcerpt && p.excerpt && (
          <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-[#161613]/60">{p.excerpt}</p>
        )}
        <Meta post={p} cfg={cfg} locale={locale} readTime={t("readTime", { count: p.readMinutes })} />
      </div>
    </Link>
  );

  const ListRow = ({ p }: { p: BlogPost }) => (
    <Link key={p.id} href={href(p.id)} className="group flex gap-4 rounded-2xl border border-[#161613]/10 bg-white p-4 transition hover:border-[#161613]/25 hover:shadow-sm sm:gap-5">
      {cfg.showCover && (
        <div className="w-32 shrink-0 sm:w-48">
          <div className="overflow-hidden rounded-xl">
            <Cover url={p.coverUrl} title={p.title} ratio="16 / 10" />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <h3 className="display-serif text-lg leading-snug text-[#161613] sm:text-xl">{p.title}</h3>
        {cfg.showExcerpt && p.excerpt && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[#161613]/60">{p.excerpt}</p>
        )}
        <Meta post={p} cfg={cfg} locale={locale} readTime={t("readTime", { count: p.readMinutes })} />
      </div>
    </Link>
  );

  return (
    <div className="space-y-8">
      {useHero && (
        <Link href={href(hero.id)} className="group block overflow-hidden rounded-3xl border border-[#161613]/10 bg-white transition hover:border-[#161613]/25 hover:shadow-lg md:grid md:grid-cols-2">
          {cfg.showCover && <Cover url={hero.coverUrl} title={hero.title} ratio="16 / 10" />}
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <div className="mb-3">
              <Pill className="bg-[var(--brand-soft)] text-[var(--brand)]">{t("latest")}</Pill>
            </div>
            <h2 className="display-serif text-3xl leading-tight text-[#161613]">{hero.title}</h2>
            {cfg.showExcerpt && hero.excerpt && (
              <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-[#161613]/60">{hero.excerpt}</p>
            )}
            <Meta post={hero} cfg={cfg} locale={locale} readTime={t("readTime", { count: hero.readMinutes })} />
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--brand)]">
              {t("readMore")} <Icon name="chevron" size={16} className="-rotate-90" />
            </span>
          </div>
        </Link>
      )}

      {gridPosts.length > 0 &&
        (cfg.layout === "LIST" ? (
          <div className="space-y-4">
            {gridPosts.map((p) => (
              <ListRow key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <div className={`grid gap-6 ${gridColsClass(cfg.columns)}`}>
            {gridPosts.map((p) => (
              <GridCard key={p.id} p={p} />
            ))}
          </div>
        ))}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-lg border border-[#161613]/10 px-3 py-1.5 text-sm font-medium text-[#161613]/80 transition hover:bg-[#161613]/[0.03]">
              {t("previous")}
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-lg border border-[#161613]/10 px-3 py-1.5 text-sm font-medium text-[#161613]/30">{t("previous")}</span>
          )}
          <span className="px-3 text-sm text-[#161613]/60">{t("page", { page, pageCount })}</span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="rounded-lg border border-[#161613]/10 px-3 py-1.5 text-sm font-medium text-[#161613]/80 transition hover:bg-[#161613]/[0.03]">
              {t("next")}
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-lg border border-[#161613]/10 px-3 py-1.5 text-sm font-medium text-[#161613]/30">{t("next")}</span>
          )}
        </div>
      )}
    </div>
  );
}
