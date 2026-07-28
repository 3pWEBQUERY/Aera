"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";

/**
 * Bilder eines Beitrags — Raster plus Vollansicht.
 *
 * Ein Bild bleibt gross. Ab zwei entsteht ein Raster: zwei nebeneinander,
 * beim Dreier eines gross links ueber beide Reihen, ab vier ein Vierer-Raster
 * mit einer Zaehlung auf dem letzten Feld. Alle Kacheln sind quadratisch
 * beschnitten — eine Reihe aus Hoch- und Querformaten haette sonst eine
 * ausgefranste Unterkante.
 *
 * Ein Klick oeffnet das Bild ungeschnitten. Wichtig ist dabei das vierte
 * Feld: dort liegen bei fuenf und mehr Bildern die verdeckten, und genau die
 * will man sehen. Der Sprung landet deshalb auf dem angeklickten Bild und
 * blaettert von dort durch alle, nicht nur durch die sichtbaren.
 *
 * Gesperrte Beitraege lassen sich nicht oeffnen: dort steht ein verwischtes
 * Bild als Andeutung, das gross zu zeigen waere gerade die Umgehung.
 */
export function PostImages({
  urls,
  locked = false,
}: {
  urls: string[];
  locked?: boolean;
}) {
  const t = useTranslations("community.render.gallery");
  const [open, setOpen] = useState<number | null>(null);

  if (urls.length === 0) return null;
  const blur = locked ? { filter: "blur(22px)", transform: "scale(1.12)" } : undefined;

  const openable = (i: number) => !locked && setOpen(i);

  if (urls.length === 1) {
    return (
      <>
        <button
          type="button"
          onClick={() => openable(0)}
          disabled={locked}
          aria-label={locked ? undefined : t("enlargeImage")}
          className="relative mt-3 block max-h-[28rem] w-full overflow-hidden rounded-xl border border-[#161613]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] enabled:cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[0]} alt="" className="max-h-[28rem] w-full object-cover" style={blur} />
          {locked && <span className="absolute inset-0 bg-[#161613]/15" />}
        </button>
        {open !== null && (
          <Lightbox urls={urls} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
        )}
      </>
    );
  }

  const shown = urls.slice(0, 4);
  const rest = urls.length - shown.length;

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-1.5 overflow-hidden rounded-xl border border-[#161613]/10">
        {shown.map((url, i) => (
          <button
            key={`${url}-${i}`}
            type="button"
            onClick={() => openable(i)}
            disabled={locked}
            aria-label={locked ? undefined : t("enlargeImage")}
            // Beim Dreier fuellt das erste Bild die linke Spalte ueber beide
            // Reihen. `h-full` statt eines Seitenverhaeltnisses: die Hoehe
            // kommt aus den beiden quadratischen Kacheln daneben, sonst bliebe
            // unter dem grossen Bild eine weisse Luecke.
            className={`relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-ring)] enabled:cursor-zoom-in ${
              urls.length === 3 && i === 0 ? "row-span-2 h-full" : "aspect-square"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={blur}
            />
            {locked && <span className="absolute inset-0 bg-[#161613]/15" />}
            {rest > 0 && i === shown.length - 1 && (
              <span className="absolute inset-0 flex items-center justify-center bg-[#161613]/55 text-xl font-semibold text-white">
                +{rest}
              </span>
            )}
          </button>
        ))}
      </div>
      {open !== null && (
        <Lightbox urls={urls} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function Lightbox({
  urls,
  index,
  onIndex,
  onClose,
}: {
  urls: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("community.render.gallery");
  const titleId = useId();
  const dialogRef = useModalAccessibility<HTMLDivElement>({ open: true, onClose });
  const many = urls.length > 1;

  const go = useCallback(
    (dir: 1 | -1) => onIndex((index + dir + urls.length) % urls.length),
    [index, urls.length, onIndex],
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

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-[80] flex flex-col bg-black/95"
    >
      <h2 id={titleId} className="sr-only">
        {t("enlargeImage")}
      </h2>

      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-medium tabular-nums text-white/70">
          {many ? `${index + 1} / ${urls.length}` : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <Icon name="close" size={22} />
        </button>
      </div>

      {/* Klick auf die Flaeche schliesst, Klick auf das Bild nicht — sonst
          schliesst jeder Versuch, das Bild anzufassen, die Ansicht. */}
      <div
        role="presentation"
        onClick={onClose}
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[index]}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain"
        />

        {many && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              aria-label={t("prevImage")}
              className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:left-6"
            >
              <Icon name="chevron" size={20} className="rotate-90" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              aria-label={t("nextImage")}
              className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:right-6"
            >
              <Icon name="chevron" size={20} className="-rotate-90" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
