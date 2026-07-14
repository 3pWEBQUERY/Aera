"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { purchaseMediaPackageAction, purchaseMediaItemAction } from "@/app/actions/engage";
import { Icon } from "@/components/dashboard/icons";
import { Pill } from "@/components/ui/misc";
import { formatPrice, cn } from "@/lib/utils";

/**
 * Force a real "save as" dialog. Same-origin proxy URLs (default in this app)
 * download as a blob; direct S3 URLs fall back to the proxy's ?download param
 * or opening in a new tab.
 */
async function saveFile(url: string, filename: string) {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    window.open(`${url}${sep}download=${encodeURIComponent(filename)}`, "_blank");
  }
}

function fileName(pkgTitle: string, index: number, url: string, type: "IMAGE" | "VIDEO") {
  const extMatch = url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
  const ext = extMatch ? extMatch[1] : type === "VIDEO" ? "mp4" : "jpg";
  const base = pkgTitle.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "medium";
  return `${base}-${index + 1}.${ext}`;
}

interface CItem {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string | null;
  caption: string | null;
  locked?: boolean;
  priceCents?: number;
  teaserUrl?: string | null;
}
export interface CPackage {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  priceCents: number;
  owned: boolean;
  itemCount: number;
  imageCount: number;
  videoCount: number;
  items: CItem[];
}

export function GalleryFolders({
  slug,
  space,
  packages,
  initialOpen = null,
}: {
  slug: string;
  space: string;
  packages: CPackage[];
  initialOpen?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const active = packages.find((p) => p.id === openId) ?? null;
  const t = useTranslations("community.render.gallery");
  const locale = useLocale();

  useEffect(() => {
    if (!active) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [active]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {packages.map((p) => {
          const locked = !p.owned && p.priceCents > 0;
          return (
            <button
              key={p.id}
              onClick={() => setOpenId(p.id)}
              className="group relative overflow-hidden rounded-2xl border border-[#161613]/10 bg-white text-left transition hover:border-[#161613]/25 hover:shadow-md"
            >
              <div className="relative w-full overflow-hidden bg-[#161613]/5" style={{ aspectRatio: "1 / 1" }}>
                {p.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.coverUrl}
                    alt={p.title}
                    className={cn(
                      "absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.03]",
                      locked && "blur-md",
                    )}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[#161613]/30">
                    <Icon name="gallery" size={30} />
                  </div>
                )}

                {locked && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#161613]/40 text-white">
                    <Icon name="lock" size={22} />
                    <span className="text-sm font-semibold">{formatPrice(p.priceCents, "eur", locale)}</span>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-6 text-[11px] font-medium text-white">
                  {p.imageCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="gallery" size={12} /> {p.imageCount}
                    </span>
                  )}
                  {p.videoCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="videos" size={12} /> {p.videoCount}
                    </span>
                  )}
                </div>

                {p.owned && p.priceCents > 0 && (
                  <span className="absolute right-2 top-2">
                    <Pill className="bg-emerald-500/90 text-white backdrop-blur">{t("owned")}</Pill>
                  </span>
                )}
                {p.priceCents === 0 && (
                  <span className="absolute right-2 top-2">
                    <Pill className="bg-white/85 text-[#161613]/80 backdrop-blur">{t("free")}</Pill>
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate font-semibold text-[#161613]">{p.title}</p>
                <p className="mt-0.5 text-xs text-[#161613]/50">
                  {t("mediaCount", { count: p.itemCount })}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {active && (
        <FolderModal slug={slug} space={space} pkg={active} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

function FolderModal({
  slug,
  space,
  pkg,
  onClose,
}: {
  slug: string;
  space: string;
  pkg: CPackage;
  onClose: () => void;
}) {
  const locked = !pkg.owned && pkg.priceCents > 0;
  const [lightbox, setLightbox] = useState<number | null>(null);
  const t = useTranslations("community.render.gallery");
  const locale = useLocale();

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white">
      {/* Full-bleed header */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#161613]/10 px-4 py-3.5 sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-[#161613]">{pkg.title}</h2>
          <p className="text-xs text-[#161613]/50">
            {t("mediaCount", { count: pkg.itemCount })}
            {pkg.priceCents > 0 ? ` · ${formatPrice(pkg.priceCents, "eur", locale)}` : ` · ${t("free")}`}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t("close")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#161613]/60 transition hover:bg-[#161613]/5 hover:text-[#161613] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
        >
          <Icon name="close" size={22} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          {locked && (
            <div className="mx-auto mb-6 max-w-md pt-2 text-center">
              <div
                className="relative mx-auto w-full overflow-hidden rounded-2xl bg-[#161613]/5"
                style={{ aspectRatio: "16 / 9" }}
              >
                {pkg.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pkg.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover blur-lg" />
                )}
                <div className="absolute inset-0 flex items-center justify-center text-white">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#161613]/70">
                    <Icon name="lock" size={26} />
                  </span>
                </div>
              </div>
              <h3 className="mt-5 text-base font-semibold text-[#161613]">{t("unlockTitle")}</h3>
              {pkg.description && <p className="mt-1 text-sm text-[#161613]/60">{pkg.description}</p>}
              <p className="mt-1 text-sm text-[#161613]/50">
                {t("imagesVideos", { images: pkg.imageCount, videos: pkg.videoCount })}
              </p>
              <form action={purchaseMediaPackageAction} className="mx-auto mt-6 max-w-xs">
                <input type="hidden" name="tenant" value={slug} />
                <input type="hidden" name="space" value={space} />
                <input type="hidden" name="packageId" value={pkg.id} />
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#161613] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#33332e] active:scale-[0.99]">
                  <Icon name="lock" size={16} /> {t("unlockFor", { price: formatPrice(pkg.priceCents, "eur", locale) })}
                </button>
              </form>
            </div>
          )}
          {!locked && pkg.description && (
            <p className="mb-5 max-w-2xl text-sm text-[#161613]/60">{pkg.description}</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {pkg.items.map((it, i) =>
              it.locked ? (
                <div
                  key={it.id}
                  className="relative overflow-hidden rounded-xl border border-[#161613]/10 bg-[#161613]/5"
                  style={{ aspectRatio: "1 / 1" }}
                >
                  {it.teaserUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.teaserUrl} alt="" className="absolute inset-0 h-full w-full object-cover blur-lg" />
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#161613]/45 p-2 text-center text-white">
                    <Icon name="lock" size={20} />
                    {(it.priceCents ?? 0) > 0 && (
                      <form action={purchaseMediaItemAction}>
                        <input type="hidden" name="tenant" value={slug} />
                        <input type="hidden" name="space" value={space} />
                        <input type="hidden" name="itemId" value={it.id} />
                        <button className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#161613] transition hover:bg-white/90">
                          {t("unlockFor", { price: formatPrice(it.priceCents ?? 0, "eur", locale) })}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ) : (
                <figure
                  key={it.id}
                  className="group relative overflow-hidden rounded-xl border border-[#161613]/10 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => it.type === "IMAGE" && setLightbox(i)}
                    className={cn(
                      "relative block w-full overflow-hidden bg-[#161613]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
                      it.type === "IMAGE" ? "cursor-zoom-in" : "cursor-default",
                    )}
                    style={{ aspectRatio: "1 / 1" }}
                    aria-label={it.type === "IMAGE" ? t("enlargeImage") : undefined}
                  >
                    {it.type === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.url ?? ""}
                        alt={it.caption ?? ""}
                        className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={it.url ?? ""} controls preload="metadata" className="absolute inset-0 h-full w-full bg-black object-contain" />
                    )}
                  </button>

                  {/* Download button */}
                  <button
                    type="button"
                    onClick={() => it.url && saveFile(it.url, fileName(pkg.title, i, it.url, it.type))}
                    aria-label={t("save")}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur-sm transition hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Icon name="export" size={15} />
                  </button>

                  {it.caption && (
                    <figcaption className="px-3 py-2 text-xs text-[#161613]/60">{it.caption}</figcaption>
                  )}
                </figure>
              ),
            )}
          </div>
        </div>
      </div>

      {lightbox !== null && (
        <Lightbox
          items={pkg.items}
          index={lightbox}
          title={pkg.title}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function Lightbox({
  items,
  index,
  title,
  onIndex,
  onClose,
}: {
  items: CItem[];
  index: number;
  title: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("community.render.gallery");
  // Only images are opened in the lightbox; keep their original order/indices.
  const item = items[index];

  const go = useCallback(
    (dir: 1 | -1) => {
      let i = index;
      for (let step = 0; step < items.length; step++) {
        i = (i + dir + items.length) % items.length;
        if (items[i].type === "IMAGE" && !items[i].locked && items[i].url) break;
      }
      onIndex(i);
    },
    [index, items, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const imageCount = items.filter((i) => i.type === "IMAGE").length;
  const hasMultiple = imageCount > 1;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-end gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => item.url && saveFile(item.url, fileName(title, index, item.url, "IMAGE"))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <Icon name="export" size={16} /> {t("save")}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <Icon name="close" size={22} />
        </button>
      </div>

      {/* Image */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url ?? ""}
          alt={item.caption ?? ""}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain"
        />

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              aria-label={t("prevImage")}
              className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:left-6"
            >
              <Icon name="chevron" size={22} className="rotate-90" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              aria-label={t("nextImage")}
              className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:right-6"
            >
              <Icon name="chevron" size={22} className="-rotate-90" />
            </button>
          </>
        )}
      </div>

      {item.caption && (
        <p className="shrink-0 px-4 pb-5 text-center text-sm text-white/70">{item.caption}</p>
      )}
    </div>
  );
}
