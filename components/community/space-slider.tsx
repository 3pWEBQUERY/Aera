"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { HScrollRow } from "./h-scroll-row";

export interface SpaceCardData {
  slug: string;
  name: string;
  icon: IconName;
  /** Space-Typ, z. B. "Galerie" oder "Videos" (steckt auch in `meta`). */
  category: string;
  /** Kleine Zeile unter dem Namen, z. B. "Galerie · 12 Beiträge". */
  meta: string;
  locked: boolean;
  /** Was die Sperre verlangt: „Nur Mitglieder“ oder der Name der Mitgliedschaft. */
  lockLabel?: string | null;
}

/** Poster palette — same muted tones as the landing-page space marquee. */
const TILE_TONES = [
  "bg-[#ece7dc] text-[#161613]",
  "bg-[#21372b] text-[#ece7dc]",
  // Etwas dunkler als das Landing-Rot, damit auch die kleine Zeile 4,5:1 hält.
  "bg-[#b14a31] text-[#f7f1e8]",
  "bg-[#1c1c19] text-[#ece7dc]",
  "bg-[#d8d1f0] text-[#241458]",
];

function SpaceCard({
  slug,
  space,
  tone,
}: {
  slug: string;
  space: SpaceCardData;
  tone: string;
}) {
  const t = useTranslations("community.render.spaceCard");
  const lockText = space.lockLabel ?? t("locked");
  return (
    <Link
      href={`/c/${slug}/s/${space.slug}`}
      className={cn(
        "group flex h-44 flex-col justify-between rounded-2xl p-5 transition duration-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/30 sm:h-48",
        tone,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Icon name={space.icon} size={18} className="shrink-0" />
        {space.locked && (
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-semibold">
            <Icon name="lock" size={11} className="shrink-0" />
            <span className="truncate">{lockText}</span>
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="display-serif truncate text-3xl leading-none">{space.name}</p>
        {space.meta && <p className="mt-2 truncate text-sm font-medium">{space.meta}</p>}
      </div>
    </Link>
  );
}

/** "Entdecken" row — poster tiles like the landing-page space marquee. */
export function SpaceSlider({
  title,
  slug,
  items,
}: {
  title: string;
  slug: string;
  items: SpaceCardData[];
}) {
  if (items.length === 0) return null;

  return (
    <HScrollRow title={title}>
      {items.map((space, i) => (
        <div
          key={space.slug}
          className="min-w-0 shrink-0 basis-[70%] snap-start sm:basis-[calc(40%-10px)] lg:basis-[calc(28%-11px)]"
        >
          <SpaceCard
            slug={slug}
            space={space}
            tone={TILE_TONES[i % TILE_TONES.length]}
          />
        </div>
      ))}
    </HScrollRow>
  );
}
