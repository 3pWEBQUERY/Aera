"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  saveSpaceAdAction,
  deleteSpaceAdAction,
  moveSpaceAdAction,
} from "@/app/actions/ads";
import type { ActionState } from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { ImageUpload } from "./image-upload";
import { VideoUpload } from "./video-upload";
import { Input, Label } from "@/components/ui/field";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";
import { cn, formatDate } from "@/lib/utils";

export interface AdRow {
  id: string;
  title: string;
  mediaUrl: string;
  mediaType: "IMAGE" | "VIDEO";
  targetUrl: string | null;
  durationSec: number;
  endsAt: string | null;
  isPublished: boolean;
}

interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

/** Dashboard manager for ADS spaces ("Werbung"): creator-run banner rotation. */
export function AdsManager({
  slug,
  space,
  ads,
}: {
  slug: string;
  space: SpaceInfo;
  ads: AdRow[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdRow | null>(null);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.ads");
  const locale = useLocale();

  function openCreate() {
    setEditing(null);
    setNonce((n) => n + 1);
    setOpen(true);
  }
  function openEdit(ad: AdRow) {
    setEditing(ad);
    setNonce((n) => n + 1);
    setOpen(true);
  }

  const activeCount = ads.filter(
    (a) => a.isPublished && (!a.endsAt || new Date(a.endsAt) > new Date()),
  ).length;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="megaphone" size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
              <Pill className="bg-slate-100 text-slate-500">{t("badge")}</Pill>
            </div>
            <p className="text-sm text-slate-400">
              /{space.slug} · {t("meta", { count: ads.length, active: activeCount })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/c/${slug}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="external" size={16} className="text-slate-400" />
            {t("viewCommunity")}
          </Link>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
          >
            <Icon name="plus" size={18} />
            {t("create")}
          </button>
        </div>
      </div>

      <p className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        {t.rich("rotateHint", {
          a: (chunks) => (
            <Link
              href={`/dashboard/${slug}/layout`}
              className="font-medium text-slate-900 underline underline-offset-2"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>

      {ads.length === 0 ? (
        <EmptyState
          icon="megaphone"
          title={t("emptyTitle")}
          hint={t("emptyHint")}
        >
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Icon name="plus" size={18} /> {t("create")}
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {ads.map((a, i) => {
            const ended = a.endsAt ? new Date(a.endsAt) <= new Date() : false;
            return (
              <div
                key={a.id}
                className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {a.mediaType === "VIDEO" ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={a.mediaUrl} muted preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.mediaUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{a.title}</p>
                    {!a.isPublished ? (
                      <Pill className="bg-slate-100 text-slate-500">{t("draft")}</Pill>
                    ) : ended ? (
                      <Pill className="bg-amber-100 text-amber-700">{t("ended")}</Pill>
                    ) : (
                      <Pill className="bg-emerald-100 text-emerald-700">{t("active")}</Pill>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {a.mediaType === "VIDEO" ? t("video") : t("image")} · {t("durationInfo", { seconds: a.durationSec })}
                    {a.endsAt && ` · ${t("untilDate", { date: formatDate(a.endsAt, locale) })}`}
                  </p>
                  {a.targetUrl && (
                    <a
                      href={a.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-sm text-slate-500 hover:text-slate-900 hover:underline"
                    >
                      {a.targetUrl}
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <form action={moveSpaceAdAction}>
                    <input type="hidden" name="tenant" value={slug} />
                    <input type="hidden" name="spaceId" value={space.id} />
                    <input type="hidden" name="adId" value={a.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button
                      disabled={i === 0}
                      aria-label={t("moveUp")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                    >
                      <Icon name="chevron" size={15} className="rotate-180" />
                    </button>
                  </form>
                  <form action={moveSpaceAdAction}>
                    <input type="hidden" name="tenant" value={slug} />
                    <input type="hidden" name="spaceId" value={space.id} />
                    <input type="hidden" name="adId" value={a.id} />
                    <input type="hidden" name="dir" value="down" />
                    <button
                      disabled={i === ads.length - 1}
                      aria-label={t("moveDown")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                    >
                      <Icon name="chevron" size={15} />
                    </button>
                  </form>
                  <button
                    onClick={() => openEdit(a)}
                    aria-label={t("edit")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Icon name="edit" size={15} />
                  </button>
                  <form action={deleteSpaceAdAction}>
                    <input type="hidden" name="tenant" value={slug} />
                    <input type="hidden" name="spaceId" value={space.id} />
                    <input type="hidden" name="adId" value={a.id} />
                    <button
                      aria-label={t("delete")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t("sheetEdit") : t("create")}
        subtitle={space.name}
        icon="megaphone"
      >
        <AdForm
          key={nonce}
          slug={slug}
          space={space}
          ad={editing}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function AdForm({
  slug,
  space,
  ad,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  ad: AdRow | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveSpaceAdAction, initial);
  const [mediaType, setMediaType] = useState<"IMAGE" | "VIDEO">(
    ad?.mediaType ?? "IMAGE",
  );
  const t = useTranslations("dashboard.ads");
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  // datetime-local needs "YYYY-MM-DDTHH:mm".
  const endsAtLocal = ad?.endsAt ? ad.endsAt.slice(0, 16) : "";

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      <input type="hidden" name="mediaType" value={mediaType} />
      {ad && <input type="hidden" name="adId" value={ad.id} />}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />

          <div>
            <Label htmlFor="ad-title">{t("titleLabel")}</Label>
            <Input
              id="ad-title"
              name="title"
              required
              defaultValue={ad?.title ?? ""}
              placeholder={t("titlePlaceholder")}
              className="text-base"
            />
          </div>

          <div>
            <Label>{t("mediaType")}</Label>
            <div className="grid grid-cols-2 gap-3">
              {(["IMAGE", "VIDEO"] as const).map((mt) => {
                const sel = mediaType === mt;
                return (
                  <button
                    key={mt}
                    type="button"
                    onClick={() => setMediaType(mt)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors duration-200",
                      sel
                        ? "border-black bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition",
                        sel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      <Icon name={mt === "IMAGE" ? "gallery" : "videos"} size={18} />
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {mt === "IMAGE" ? t("image") : t("video")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="block text-sm font-medium text-slate-700">
                {t("bannerMedium")}
              </span>
              <span className="group relative inline-flex">
                <button
                  type="button"
                  aria-label={t("recommendedSizeAria")}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <Icon name="info" size={15} />
                </button>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-xl bg-slate-900 p-3.5 text-left opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <span className="block text-xs font-bold uppercase tracking-wide text-white/60">
                    {t("recommendedSize")}
                  </span>
                  <span className="mt-1.5 block text-sm font-semibold text-white">
                    {t("recommendedSizeValue")}
                  </span>
                  <span className="mt-1.5 block text-xs leading-5 text-white/70">
                    {t("recommendedSizeHint")}
                  </span>
                </span>
              </span>
            </div>
            {mediaType === "IMAGE" ? (
              <ImageUpload
                tenant={slug}
                name="mediaUrl"
                purpose="ad-media"
                defaultUrl={ad?.mediaType === "IMAGE" ? ad.mediaUrl : null}
              />
            ) : (
              <VideoUpload
                tenant={slug}
                name="mediaUrl"
                purpose="ad-media"
                defaultUrl={ad?.mediaType === "VIDEO" ? ad.mediaUrl : null}
              />
            )}
          </div>

          <div>
            <Label htmlFor="ad-target">{t("targetLabel")}</Label>
            <Input
              id="ad-target"
              name="targetUrl"
              defaultValue={ad?.targetUrl ?? ""}
              placeholder={t("targetPlaceholder")}
            />
            <p className="mt-1 text-xs text-slate-400">
              {t("targetHint")}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="ad-duration">{t("durationLabel")}</Label>
              <Input
                id="ad-duration"
                name="durationSec"
                type="number"
                min={3}
                max={60}
                defaultValue={ad?.durationSec ?? 8}
              />
              <p className="mt-1 text-xs text-slate-400">
                {t("durationHint")}
              </p>
            </div>
            <div>
              <Label htmlFor="ad-ends">{t("endsLabel")}</Label>
              <Input
                id="ad-ends"
                name="endsAt"
                type="datetime-local"
                defaultValue={endsAtLocal}
              />
              <p className="mt-1 text-xs text-slate-400">
                {t("endsHint")}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={ad ? ad.isPublished : true}
              className="h-4 w-4 accent-slate-900"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">
                {t("publishedLabel")}
              </span>
              <span className="block text-xs text-slate-400">
                {t("publishedHint")}
              </span>
            </span>
          </label>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? t("saving") : ad ? t("save") : t("create")}
        </button>
      </div>
    </form>
  );
}
