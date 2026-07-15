"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "@/app/actions/locale";
import {
  SUPPORTED_LOCALES,
  LOCALE_LABELS,
  LOCALE_FLAGS,
  type AppLocale,
} from "@/i18n/locales";

/**
 * Runde SVG-Flagge (circle-flags): füllt den Kreis vollständig aus.
 * Der Inset-Ring liegt als Overlay über der Grafik und gibt der Kante
 * auf dunklem Grund eine saubere, dezente Kontur.
 */
function Flag({ locale, size = 24 }: { locale: AppLocale; size?: number }) {
  return (
    <span
      aria-hidden
      className="relative block shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      <Image
        src={LOCALE_FLAGS[locale]}
        alt=""
        width={size}
        height={size}
        unoptimized
        draggable={false}
        className="h-full w-full object-cover"
      />
      <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/15 ring-inset" />
    </span>
  );
}

/**
 * Runder Sprach-Button für den dunklen Marketing-Header: zeigt die Flagge
 * der aktiven Sprache und öffnet ein Popover mit allen Sprachen (runde
 * SVG-Flaggen + native Namen). Auswahl speichert das Cookie per Server-Action.
 */
export function LanguagePopover() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("language");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // WICHTIG: Die Action programmatisch aufrufen statt per <form> — würde das
  // Popover beim Klick schließen, wäre das Formular schon aus dem DOM entfernt,
  // bevor der Browser den Submit abschickt (Sprache wechselte dann nie).
  function choose(l: AppLocale) {
    const fd = new FormData();
    fd.set("locale", l);
    startTransition(async () => {
      await setLocaleAction(fd);
      setOpen(false);
    });
  }

  // Außenklick & Escape schließen das Popover.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("title")}
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          "group flex h-10 w-10 items-center justify-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 " +
          (open
            ? "border-white/40 bg-white/10"
            : "border-white/15 hover:border-white/40 hover:bg-white/10")
        }
      >
        <span className="transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
          <Flag locale={locale} size={26} />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="popover-in absolute right-0 top-full z-50 mt-2 w-[19rem] origin-top-right rounded-2xl border border-white/10 bg-[#161613]/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl sm:w-[26rem]"
        >
          <p className="px-3 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
            {t("title")}
          </p>
          <div className="grid max-h-[60vh] grid-cols-1 gap-0.5 overflow-y-auto sm:grid-cols-2">
            {SUPPORTED_LOCALES.map((l) => {
              const active = l === locale;
              return (
                <button
                  key={l}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={pending}
                  onClick={() => choose(l)}
                  className={
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:opacity-60 " +
                    (active
                      ? "bg-white/10 font-semibold text-white"
                      : "text-white/65 hover:bg-white/[0.07] hover:text-white")
                  }
                >
                  <Flag locale={l} size={22} />
                  <span className="min-w-0 flex-1 truncate">
                    {LOCALE_LABELS[l]}
                  </span>
                  {active && (
                    <svg
                      aria-hidden
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 shrink-0 text-white"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m3 8.5 3.2 3.2L13 4.8" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
