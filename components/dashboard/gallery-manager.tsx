"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  createMediaPackageAction,
  updateMediaPackageAction,
  deleteMediaPackageAction,
  deleteMediaItemAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { MultiMediaUpload } from "./multi-media-upload";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Pill, FormError } from "@/components/ui/misc";
import { formatPrice } from "@/lib/utils";

export interface GalleryItem {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  caption: string | null;
}
export interface GalleryPackage {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  priceCents: number;
  isPublished: boolean;
  availableUntil: string | null;
  items: GalleryItem[];
}
interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

export function GalleryManager({
  slug,
  space,
  packages,
}: {
  slug: string;
  space: SpaceInfo;
  packages: GalleryPackage[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.gallery");

  const editing = packages.find((p) => p.id === editId) ?? null;

  function openCreate() {
    setNonce((n) => n + 1);
    setCreateOpen(true);
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="gallery" size={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
              <Pill className="bg-slate-100 text-slate-500">{t("badge")}</Pill>
            </div>
            <p className="text-sm text-slate-400">
              /{space.slug} · {t("packageCount", { count: packages.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/c/${slug}/s/${space.slug}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Icon name="external" size={16} className="text-slate-400" />
            {t("view")}
          </Link>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
          >
            <Icon name="plus" size={18} />
            {t("mediaPackage")}
          </button>
        </div>
      </div>

      {packages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <Icon name="gallery" size={24} />
          </div>
          <p className="mt-3 font-medium text-slate-700">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">
            {t("emptyHint")}
          </p>
          <button
            onClick={openCreate}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Icon name="plus" size={18} /> {t("createPackage")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((p) => (
            <FolderCard key={p.id} pkg={p} onOpen={() => setEditId(p.id)} slug={slug} spaceSlug={space.slug} />
          ))}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("sheetCreateTitle")}
        subtitle={space.name}
        icon="gallery"
      >
        <PackageForm key={`c${nonce}`} slug={slug} space={space} onDone={() => setCreateOpen(false)} />
      </Sheet>

      <Sheet
        open={!!editing}
        onClose={() => setEditId(null)}
        title={t("sheetEditTitle")}
        subtitle={editing?.title}
        icon="gallery"
      >
        {editing && (
          <PackageForm
            key={`e${editing.id}`}
            slug={slug}
            space={space}
            pkg={editing}
            onDone={() => setEditId(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function FolderCard({
  pkg,
  onOpen,
  slug,
  spaceSlug,
}: {
  pkg: GalleryPackage;
  onOpen: () => void;
  slug: string;
  spaceSlug: string;
}) {
  const imageCount = pkg.items.filter((i) => i.type === "IMAGE").length;
  const videoCount = pkg.items.filter((i) => i.type === "VIDEO").length;
  const paid = pkg.priceCents > 0;
  const t = useTranslations("dashboard.gallery");
  const locale = useLocale();

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-md">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative w-full overflow-hidden bg-slate-100" style={{ aspectRatio: "4 / 3" }}>
          {pkg.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pkg.coverUrl} alt={pkg.title} className="absolute inset-0 h-full w-full object-cover" />
          ) : pkg.items[0]?.type === "VIDEO" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={pkg.items[0].url} preload="metadata" className="absolute inset-0 h-full w-full bg-black object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-300">
              <Icon name="gallery" size={30} />
            </div>
          )}
          <span className="absolute left-2 top-2 flex items-center gap-1.5">
            {paid ? (
              <Pill className="bg-slate-900/85 text-white shadow-sm backdrop-blur">{formatPrice(pkg.priceCents, "eur", locale)}</Pill>
            ) : (
              <Pill className="bg-emerald-500/90 text-white shadow-sm backdrop-blur">{t("free")}</Pill>
            )}
            {!pkg.isPublished && (
              <Pill className="bg-amber-500/90 text-white shadow-sm backdrop-blur">{t("draft")}</Pill>
            )}
          </span>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2 pt-8 text-xs font-medium text-white">
            {imageCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Icon name="gallery" size={13} /> {imageCount}
              </span>
            )}
            {videoCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Icon name="videos" size={13} /> {videoCount}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-start justify-between gap-2 p-3.5">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{pkg.title}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {t("mediaCount", { count: pkg.items.length })}
            </p>
          </div>
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-slate-900 group-hover:text-white">
            <Icon name="chevron" size={15} className="-rotate-90" />
          </span>
        </div>
      </button>
      <form
        action={deleteMediaPackageAction}
        className="absolute right-2 top-2 sm:opacity-0 sm:transition sm:group-hover:opacity-100"
      >
        <input type="hidden" name="tenant" value={slug} />
        <input type="hidden" name="spaceSlug" value={spaceSlug} />
        <input type="hidden" name="packageId" value={pkg.id} />
        <button
          aria-label={t("deletePackageAria")}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-red-600 shadow hover:bg-white"
          onClick={(e) => {
            if (!confirm(t("confirmDeletePackage"))) e.preventDefault();
          }}
        >
          <Icon name="close" size={15} />
        </button>
      </form>
    </div>
  );
}

function PackageForm({
  slug,
  space,
  pkg,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  pkg?: GalleryPackage;
  onDone: () => void;
}) {
  const isEdit = !!pkg;
  const [state, action, pending] = useActionState(
    isEdit ? updateMediaPackageAction : createMediaPackageAction,
    initial,
  );
  const [paid, setPaid] = useState((pkg?.priceCents ?? 0) > 0);
  const [priceEur, setPriceEur] = useState(
    pkg && pkg.priceCents > 0 ? (pkg.priceCents / 100).toFixed(2) : "",
  );
  const t = useTranslations("dashboard.gallery");

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const priceCents = paid ? Math.max(0, Math.round(parseFloat(priceEur.replace(",", ".")) * 100) || 0) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Existing items (edit only) — separate forms so they can be removed inline. */}
      {isEdit && pkg!.items.length > 0 && (
        <div className="shrink-0 border-b border-slate-200 bg-slate-50/60 px-6 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("contentCount", { count: pkg!.items.length })}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {pkg!.items.map((it) => (
              <div
                key={it.id}
                className="group/thumb relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                style={{ aspectRatio: "1 / 1" }}
              >
                {it.type === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video src={it.url} preload="metadata" className="absolute inset-0 h-full w-full bg-black object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
                      {t("video")}
                    </span>
                  </>
                )}
                <form action={deleteMediaItemAction} className="absolute right-1 top-1 sm:opacity-0 sm:transition sm:group-hover/thumb:opacity-100">
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="spaceSlug" value={space.slug} />
                  <input type="hidden" name="itemId" value={it.id} />
                  <button aria-label={t("removeAria")} className="flex h-5 w-5 items-center justify-center rounded bg-white/90 text-red-600 shadow hover:bg-white">
                    <Icon name="close" size={11} />
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      <form action={action} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="tenant" value={slug} />
        <input type="hidden" name="spaceId" value={space.id} />
        <input type="hidden" name="spaceSlug" value={space.slug} />
        {isEdit && <input type="hidden" name="packageId" value={pkg!.id} />}
        <input type="hidden" name="priceCents" value={priceCents} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-xl space-y-5 px-6 py-8">
            <FormError message={state.error} />

            <div>
              <Label htmlFor="mp-title">{t("titleLabel")}</Label>
              <Input
                id="mp-title"
                name="title"
                required
                defaultValue={pkg?.title}
                placeholder={t("titlePlaceholder")}
                className="text-base"
              />
            </div>

            <div>
              <Label htmlFor="mp-desc">{t("descLabel")}</Label>
              <Textarea id="mp-desc" name="description" rows={3} defaultValue={pkg?.description ?? ""} placeholder={t("descPlaceholder")} />
            </div>

            <div>
              <Label>{isEdit ? t("addMedia") : t("media")}</Label>
              <MultiMediaUpload tenant={slug} name="items" purpose="gallery" />
              {isEdit && (
                <p className="mt-1.5 text-xs text-slate-400">{t("addMediaHint")}</p>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <button
                type="button"
                onClick={() => setPaid((v) => !v)}
                className="flex w-full items-center justify-between text-left"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-800">{t("sell")}</span>
                  <span className="block text-xs text-slate-400">
                    {paid ? t("sellOn") : t("sellOff")}
                  </span>
                </span>
                <span
                  className={
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
                    (paid ? "bg-slate-900" : "bg-slate-200")
                  }
                >
                  <span
                    className={
                      "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
                      (paid ? "translate-x-5" : "translate-x-0.5")
                    }
                  />
                </span>
              </button>
              {paid && (
                <div>
                  <Label htmlFor="mp-price">{t("priceLabel")}</Label>
                  <Input
                    id="mp-price"
                    inputMode="decimal"
                    value={priceEur}
                    onChange={(e) => setPriceEur(e.target.value)}
                    placeholder="9,99"
                  />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="mp-until">{t("availableUntilLabel")}</Label>
              <Input
                id="mp-until"
                name="availableUntil"
                type="datetime-local"
                defaultValue={pkg?.availableUntil ? pkg.availableUntil.slice(0, 16) : ""}
              />
              <p className="mt-1 text-xs text-slate-400">{t("availableUntilHint")}</p>
            </div>

            <Switch
              name="isPublished"
              defaultChecked={pkg?.isPublished ?? true}
              label={t("publishedLabel")}
              hint={t("publishedHint")}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? t("saving") : isEdit ? t("saveChanges") : t("createPackageCta")}
          </button>
        </div>
      </form>
    </div>
  );
}
