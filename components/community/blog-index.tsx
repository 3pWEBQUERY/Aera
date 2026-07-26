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
  likes: number;
  /** Bezahlt oder nur fuer Mitglieder — Auszug und Cover bleiben zurueck. */
  locked: boolean;
}

/**
 * Titelplatte fuer Karten ohne Bild.
 *
 * Gilt fuer zwei Faelle: der Beitrag ist gesperrt (dann liefern wir das Cover
 * gar nicht aus) oder der Creator hat keins gesetzt. Der Ton kommt aus der
 * Primaerfarbe der Community, immer ins Dunkle gemischt — weisse Schrift muss
 * auch auf einer hellen Markenfarbe lesbar bleiben.
 */
const PLATE_STYLE = {
  backgroundImage:
    "linear-gradient(135deg," +
    " color-mix(in oklab, var(--brand) 38%, #1b1520) 0%," +
    " color-mix(in oklab, var(--brand) 20%, #100d15) 100%)",
} as const;

function Cover({
  url,
  title,
  ratio,
  locked,
  lockedLabel,
}: {
  url: string | null;
  title: string;
  ratio: string;
  locked: boolean;
  lockedLabel: string;
}) {
  return (
    <div className="relative w-full overflow-hidden bg-[#161613]/5" style={{ aspectRatio: ratio }}>
      {url && !locked ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={title} className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      ) : (
        <>
          <div className="absolute inset-0" style={PLATE_STYLE} />
          <div className="absolute inset-0 flex flex-col justify-center p-5 sm:p-6">
            <p
              className="line-clamp-3 text-lg font-semibold leading-tight text-white sm:text-xl"
              style={{
                maskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, #000 62%, transparent 100%)",
              }}
            >
              {title}
            </p>
          </div>
        </>
      )}
      {locked && (
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-[#161613]/85 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
          <Icon name="lock" size={13} />
          {lockedLabel}
        </span>
      )}
    </div>
  );
}

function Meta({ post, cfg, locale, readTime }: { post: BlogPost; cfg: BlogSettings; locale: string; readTime: string }) {
  const hasNumbers = post.likes > 0 || post.comments > 0;
  if (!cfg.showAuthor && !cfg.showDate && !cfg.showReadTime && !hasNumbers) return null;
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
      {cfg.showCover && <Cover url={p.coverUrl} title={p.title} ratio="16 / 9" locked={p.locked} lockedLabel={t("locked")} />}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="display-serif text-lg leading-snug text-[#161613]">{p.title}</h3>
        {cfg.showExcerpt && !p.locked && p.excerpt && (
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
            <Cover url={p.coverUrl} title={p.title} ratio="16 / 10" locked={p.locked} lockedLabel={t("locked")} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <h3 className="display-serif text-lg leading-snug text-[#161613] sm:text-xl">{p.title}</h3>
        {cfg.showExcerpt && !p.locked && p.excerpt && (
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
          {cfg.showCover && <Cover url={hero.coverUrl} title={hero.title} ratio="16 / 10" locked={hero.locked} lockedLabel={t("locked")} />}
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <div className="mb-3">
              <Pill className="bg-[var(--brand-soft)] text-[var(--brand)]">{t("latest")}</Pill>
            </div>
            <h2 className="display-serif text-3xl leading-tight text-[#161613]">{hero.title}</h2>
            {cfg.showExcerpt && !hero.locked && hero.excerpt && (
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
