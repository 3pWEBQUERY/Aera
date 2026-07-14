"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  adminTogglePostPublishedAction,
  adminDeletePostAction,
} from "@/app/actions/admin";
import { Icon } from "@/components/dashboard/icons";
import { Pill, EmptyState } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";

export interface PostRowData {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string | null;
  hasVideo: boolean;
  isPublished: boolean;
  createdAt: string;
  tenantName: string;
  tenantSlug: string;
  spaceName: string;
  spaceSlug: string;
  spaceType: string;
  authorName: string;
  authorEmail: string;
  comments: number;
  reactions: number;
}

export function PostsManager({
  rows,
  total,
  q,
  status,
  stats,
}: {
  rows: PostRowData[];
  total: number;
  q: string;
  status: string;
  stats: { all: number; published: number; unpublished: number };
}) {
  const router = useRouter();
  const t = useTranslations("admin.posts");
  const tc = useTranslations("admin");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);

  const tabHref = (s: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (s) sp.set("status", s);
    const str = sp.toString();
    return str ? `/admin/posts?${str}` : "/admin/posts";
  };

  const tabs = [
    { value: "", label: t("tabAll"), count: stats.all },
    { value: "published", label: t("tabPublished"), count: stats.published },
    { value: "unpublished", label: t("tabUnpublished"), count: stats.unpublished },
  ];

  async function handleToggle(fd: FormData) {
    await adminTogglePostPublishedAction(fd);
    router.refresh();
  }

  async function handleDelete(fd: FormData) {
    await adminDeletePostAction(fd);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          {t("title")}
          <Pill className="bg-slate-100 text-slate-500">{nf.format(total)}</Pill>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form method="GET" action="/admin/posts" className="w-full max-w-md">
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
              className="shrink-0 rounded-full bg-slate-900 px-3.5 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
            >
              {tc("search")}
            </button>
          </div>
        </form>

        <div className="flex items-center gap-1.5" role="group" aria-label={t("filterAria")}>
          {tabs.map((tab) => (
            <Link
              key={tab.value || "all"}
              href={tabHref(tab.value)}
              aria-current={status === tab.value ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] ${
                status === tab.value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label} ({nf.format(tab.count)})
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.length === 0 ? (
          <EmptyState
            icon="feed"
            title={q ? tc("noResults") : t("emptyTitle")}
            hint={q ? t("noResultsHint", { q }) : t("emptyHint")}
          />
        ) : (
          rows.map((p) => (
            <div
              key={p.id}
              className="group flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm sm:flex-nowrap sm:gap-4"
            >
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
              ) : p.hasVideo ? (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Icon name="play" size={20} />
                </span>
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                  <Icon name="feed" size={20} />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-slate-900">{p.title}</p>
                  {!p.isPublished && (
                    <Pill className="bg-amber-100 text-amber-700">{t("unpublishedBadge")}</Pill>
                  )}
                </div>
                {p.excerpt && (
                  <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">
                    {p.excerpt}
                  </p>
                )}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-400">
                  <span className="truncate">
                    {p.tenantName} · {p.spaceName} · {p.authorName} ·{" "}
                    {formatDateTime(p.createdAt, locale)}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Icon name="forum" size={12} />
                    {nf.format(p.comments)}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Icon name="heart" size={12} />
                    {nf.format(p.reactions)}
                  </span>
                </p>
              </div>

              <div className="flex w-full items-center justify-end gap-2 border-t border-slate-100 pt-2.5 sm:w-auto sm:border-0 sm:pt-0 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <a
                  href={`/c/${p.tenantSlug}/s/${p.spaceSlug}/${p.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                >
                  <Icon name="external" size={13} />
                  {tc("view")}
                </a>
                <form action={handleToggle}>
                  <input type="hidden" name="postId" value={p.id} />
                  <button
                    type="submit"
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] ${
                      p.isPublished
                        ? "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                        : "border-green-200 bg-white text-green-700 hover:bg-green-50"
                    }`}
                  >
                    {p.isPublished ? t("unpublish") : t("publish")}
                  </button>
                </form>
                <form
                  action={handleDelete}
                  onSubmit={(e) => {
                    if (!window.confirm(t("deleteConfirm"))) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="postId" value={p.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                  >
                    {tc("delete")}
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
