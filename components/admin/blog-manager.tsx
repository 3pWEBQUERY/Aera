"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  duplicatePostAction,
  setPostStatusAction,
  toggleFeaturedAction,
} from "@/app/actions/platform-blog";
import { Icon } from "@/components/dashboard/icons";
import { EmptyState, Pill } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface BlogRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverUrl: string | null;
  locale: string;
  category: string | null;
  categoryLabel: string | null;
  status: "DRAFT" | "PUBLISHED";
  /** ISO oder null. */
  publishedAt: string | null;
  scheduled: boolean;
  isFeatured: boolean;
  readingMinutes: number;
  authorName: string | null;
  updatedAt: string;
}

/**
 * Die Beitragsliste des Admin-Bereichs.
 *
 * Eine Zeile beantwortet drei Fragen auf einen Blick: Worum geht es, ist es
 * oeffentlich, und wann. Alles Weitere — bearbeiten, verstecken, duplizieren —
 * haengt rechts an der Zeile, sichtbar und ohne Menue: bei einer Handvoll
 * Beitraegen im Monat ist ein aufklappbares Menue nur ein Klick mehr.
 */
export function BlogManager({
  rows,
  total,
  q,
  status,
  stats,
}: {
  rows: BlogRow[];
  total: number;
  q: string;
  status: string;
  stats: { all: number; published: number; draft: number; scheduled: number };
}) {
  const router = useRouter();
  const t = useTranslations("admin.blog");
  const tc = useTranslations("admin");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);

  const tabHref = (value: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (value) params.set("status", value);
    const query = params.toString();
    return query ? `/admin/blog?${query}` : "/admin/blog";
  };

  const tabs = [
    { value: "", label: t("tabAll"), count: stats.all },
    { value: "published", label: t("tabPublished"), count: stats.published },
    { value: "scheduled", label: t("tabScheduled"), count: stats.scheduled },
    { value: "draft", label: t("tabDraft"), count: stats.draft },
  ];

  // Die Aktionen laufen ueber Server-Actions; `router.refresh()` holt danach
  // die Liste neu, damit die Zeile sofort den neuen Stand zeigt.
  const run = (action: (form: FormData) => Promise<void>) => async (form: FormData) => {
    await action(form);
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            {t("title")}
            <Pill className="bg-slate-100 text-slate-500">{nf.format(total)}</Pill>
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <Link
          href="/admin/blog/neu"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--action)] px-4 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)]"
        >
          <Icon name="plus" size={16} />
          {t("new")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form method="GET" action="/admin/blog" className="w-full max-w-md">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 transition focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
            <Icon name="search" size={17} className="shrink-0 text-slate-400" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchAria")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-[var(--action)] px-3.5 py-1 text-xs font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)]"
            >
              {tc("search")}
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("filterAria")}>
          {tabs.map((tab) => (
            <Link
              key={tab.value || "all"}
              href={tabHref(tab.value)}
              aria-current={status === tab.value ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                status === tab.value
                  ? "bg-[var(--action)] text-[var(--action-fg)]"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-[var(--action-soft)]",
              )}
            >
              {tab.label} ({nf.format(tab.count)})
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.length === 0 ? (
          <EmptyState
            icon="blog"
            title={q ? tc("noResults") : t("emptyTitle")}
            hint={q ? t("noResultsHint", { q }) : t("emptyHint")}
          />
        ) : (
          rows.map((row) => (
            <article
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 transition hover:border-slate-300 hover:shadow-sm sm:flex-nowrap sm:gap-4"
            >
              <Link
                href={`/admin/blog/${row.id}`}
                className="relative hidden h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:block"
              >
                {row.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-slate-300">
                    <Icon name="blog" size={20} />
                  </span>
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge row={row} t={t} />
                  {row.isFeatured && (
                    <Pill className="bg-violet-100 text-violet-700">{t("featuredShort")}</Pill>
                  )}
                  {row.categoryLabel && (
                    <Pill className="bg-slate-100 text-slate-500">{row.categoryLabel}</Pill>
                  )}
                  <Pill className="bg-slate-100 text-slate-500">{row.locale.toUpperCase()}</Pill>
                </div>
                <Link
                  href={`/admin/blog/${row.id}`}
                  className="mt-1.5 block truncate text-sm font-semibold text-slate-900 transition hover:text-[var(--brand)]"
                >
                  {row.title || t("untitled")}
                </Link>
                <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-slate-400">
                  {row.publishedAt
                    ? t("metaLine", {
                        date: formatDateTime(row.publishedAt, locale),
                        minutes: row.readingMinutes,
                      })
                    : t("metaLineDraft", {
                        date: formatDateTime(row.updatedAt, locale),
                        minutes: row.readingMinutes,
                      })}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <form action={run(toggleFeaturedAction)}>
                  <input type="hidden" name="id" value={row.id} />
                  <IconAction
                    icon="sparkles"
                    label={row.isFeatured ? t("unfeature") : t("feature")}
                    active={row.isFeatured}
                  />
                </form>

                <form action={run(setPostStatusAction)}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="publish" value={row.status === "PUBLISHED" ? "0" : "1"} />
                  <IconAction
                    icon={row.status === "PUBLISHED" ? "eyeOff" : "eye"}
                    label={row.status === "PUBLISHED" ? t("unpublish") : t("publish")}
                  />
                </form>

                <form action={run(duplicatePostAction)}>
                  <input type="hidden" name="id" value={row.id} />
                  <IconAction icon="copy" label={t("duplicate")} />
                </form>

                <Link
                  href={`/admin/blog/${row.id}`}
                  aria-label={tc("edit")}
                  title={tc("edit")}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <Icon name="edit" size={16} />
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  row,
  t,
}: {
  row: BlogRow;
  t: ReturnType<typeof useTranslations>;
}) {
  const [label, tone] = row.scheduled
    ? [t("statusScheduled"), "bg-amber-100 text-amber-700"]
    : row.status === "PUBLISHED"
      ? [t("statusPublished"), "bg-emerald-100 text-emerald-700"]
      : [t("statusDraft"), "bg-slate-200 text-slate-600"];
  return <Pill className={tone}>{label}</Pill>;
}

function IconAction({
  icon,
  label,
  active = false,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-slate-100 hover:text-slate-900",
        active ? "text-violet-600" : "text-slate-400",
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
