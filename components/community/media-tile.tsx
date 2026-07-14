"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Icon } from "@/components/dashboard/icons";
import { formatPrice } from "@/lib/utils";

export interface MediaTileData {
  id: string;
  title: string;
  href: string;
  /** null when the space itself is gated (no cover leak). */
  coverUrl: string | null;
  itemCount: number;
  imageCount: number;
  videoCount: number;
  priceCents: number;
  currency: string;
  /** Space is member/paid-gated and the visitor has no access at all. */
  spaceLocked: boolean;
  /** Owned/free — full-quality access. */
  owned: boolean;
}

/**
 * Gallery package tile for the "Bilder" row. The cover acts as thumbnail;
 * a members-gated space shows a frosted teaser, a purchasable package keeps
 * the marketing cover but overlays a price/unlock badge.
 */
export function MediaTile({ pkg }: { pkg: MediaTileData }) {
  const t = useTranslations("community.render.media");
  const locale = useLocale();
  const paid = pkg.priceCents > 0;
  const needsPurchase = !pkg.owned && !pkg.spaceLocked && paid;

  return (
    <Link
      href={pkg.href}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[#161613]/10 bg-[#161613]/5 transition duration-300 group-hover:-translate-y-1 group-hover:border-[#161613]/25">
        {pkg.spaceLocked ? (
          <>
            <div className="bg-[var(--brand)] absolute inset-0" />
            <div className="absolute inset-0 bg-white/10 backdrop-blur-md" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/50 backdrop-blur-sm">
                <Icon name="lock" size={20} />
              </span>
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm">
                {t("becomeMember")}
              </span>
            </div>
          </>
        ) : pkg.coverUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pkg.coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
            {needsPurchase && (
              <>
                <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/50 backdrop-blur-sm">
                    <Icon name="lock" size={17} />
                  </span>
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm">
                    {t("unlock", { price: formatPrice(pkg.priceCents, pkg.currency, locale) })}
                  </span>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="bg-[var(--brand)] absolute inset-0 opacity-90" />
        )}

        {/* Item-count badge (bottom-left). */}
        {!pkg.spaceLocked && pkg.itemCount > 0 && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <Icon name="gallery" size={11} />
            {pkg.imageCount > 0 && t("imagesCount", { count: pkg.imageCount })}
            {pkg.imageCount > 0 && pkg.videoCount > 0 && " · "}
            {pkg.videoCount > 0 && t("videosCount", { count: pkg.videoCount })}
          </span>
        )}
      </div>
      <h3 className="mt-2.5 line-clamp-1 text-sm font-semibold text-[#161613]">
        {pkg.title}
      </h3>
      <p className="mt-0.5 text-xs text-[#161613]/50">
        {pkg.owned || !paid
          ? t("itemsCount", { count: pkg.itemCount })
          : formatPrice(pkg.priceCents, pkg.currency, locale)}
      </p>
    </Link>
  );
}
