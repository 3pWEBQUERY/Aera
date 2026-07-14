"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { adminDeleteMediaAction } from "@/app/actions/admin";
import { Sheet } from "@/components/dashboard/sheet";
import { Icon } from "@/components/dashboard/icons";
import { Pill, EmptyState } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";

export interface MediaRowData {
  id: string;
  url: string;
  key: string;
  purpose: string;
  contentType: string | null;
  sizeBytes: number;
  visibility: string;
  createdAt: string;
  tenantName: string;
  tenantSlug: string;
  ownerName: string | null;
  ownerEmail: string | null;
}

/** Formats a byte count as B / KB / MB (no formatBytes in lib/utils). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const visibilityCls: Record<string, string> = {
  PUBLIC: "bg-green-100 text-green-700",
  MEMBERS: "bg-slate-100 text-slate-600",
  PAID: "bg-amber-100 text-amber-700",
};
const visibilityKey: Record<string, string> = {
  PUBLIC: "visPublic",
  MEMBERS: "visMembers",
  PAID: "visPaid",
};

function isImage(m: MediaRowData) {
  return (m.contentType ?? "").startsWith("image/");
}

export function MediaManager({
  rows,
  total,
  q,
  type,
  stats,
}: {
  rows: MediaRowData[];
  total: number;
  q: string;
  type: string;
  stats: { all: number; images: number; videos: number };
}) {
  const [viewing, setViewing] = useState<MediaRowData | null>(null);
  const t = useTranslations("admin.media");
  const tc = useTranslations("admin");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);

  const tabHref = (val: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (val) sp.set("type", val);
    const s = sp.toString();
    return s ? `/admin/media?${s}` : "/admin/media";
  };

  const tabs = [
    { value: "", label: t("tabAll"), count: stats.all },
    { value: "image", label: t("tabImages"), count: stats.images },
    { value: "video", label: t("tabVideos"), count: stats.videos },
  ];

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
        <form method="GET" action="/admin/media" className="w-full max-w-md">
          {type && <input type="hidden" name="type" value={type} />}
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
              aria-current={type === tab.value ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] ${
                type === tab.value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label} ({nf.format(tab.count)})
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="gallery"
          title={q ? tc("noResults") : t("emptyTitle")}
          hint={q ? t("noResultsHint", { q }) : t("emptyHint")}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {rows.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setViewing(m)}
              aria-label={t("reviewAria", { purpose: m.purpose, tenant: m.tenantName })}
              className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
            >
              {isImage(m) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
                  <Icon name="play" size={26} />
                </span>
              )}
              {m.visibility !== "PUBLIC" && (
                <span
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white"
                  title={t("notPublic")}
                >
                  <Icon name="lock" size={12} />
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-2 py-1 text-[11px] text-white">
                {m.tenantName}
              </span>
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={t("reviewTitle")}
        subtitle={viewing?.purpose}
        icon="gallery"
      >
        {viewing && (
          <DetailView key={viewing.id} media={viewing} onDone={() => setViewing(null)} />
        )}
      </Sheet>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-slate-400">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-sm font-medium text-slate-800 ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function DetailView({ media, onDone }: { media: MediaRowData; onDone: () => void }) {
  const t = useTranslations("admin.media");
  const tc = useTranslations("admin");
  const locale = useLocale();
  const visCls = visibilityCls[media.visibility] ?? visibilityCls.MEMBERS;
  const visLabel = t(visibilityKey[media.visibility] ?? "visMembers");

  async function handleDelete(fd: FormData) {
    await adminDeleteMediaAction(fd);
    onDone();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
            {isImage(media) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.url}
                alt={media.purpose}
                className="max-h-96 w-full object-contain"
              />
            ) : (
              <video
                src={media.url}
                controls
                preload="metadata"
                className="max-h-96 w-full"
              />
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <InfoRow
              label={t("community")}
              value={
                <a
                  href={`/c/${media.tenantSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--brand)] hover:underline"
                >
                  {media.tenantName}
                </a>
              }
            />
            <InfoRow label={t("purpose")} value={media.purpose} />
            <InfoRow label={t("type")} value={media.contentType ?? t("unknown")} />
            <InfoRow label={t("size")} value={formatBytes(media.sizeBytes)} />
            <InfoRow
              label={t("visibility")}
              value={<Pill className={visCls}>{visLabel}</Pill>}
            />
            <InfoRow
              label={t("uploadedBy")}
              value={
                media.ownerName
                  ? `${media.ownerName}${media.ownerEmail ? ` (${media.ownerEmail})` : ""}`
                  : t("unknown")
              }
            />
            <InfoRow label={t("date")} value={formatDateTime(media.createdAt, locale)} />
            <InfoRow label={t("key")} value={media.key} mono />
          </div>

          <a
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          >
            <Icon name="external" size={15} />
            {t("openInNewTab")}
          </a>

          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
              <Icon name="alert" size={15} />
              {tc("dangerZone")}
            </p>
            <form
              action={handleDelete}
              onSubmit={(e) => {
                if (!window.confirm(t("deleteConfirm"))) {
                  e.preventDefault();
                }
              }}
              className="mt-3"
            >
              <input type="hidden" name="objectId" value={media.id} />
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                {t("deleteBtn")}
              </button>
            </form>
            <p className="mt-2 text-xs text-red-600/90">
              {t("dangerDesc")}
            </p>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {tc("close")}
        </button>
      </div>
    </div>
  );
}
