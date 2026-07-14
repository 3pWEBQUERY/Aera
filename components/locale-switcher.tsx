"use client";

import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "@/app/actions/locale";
import {
  SUPPORTED_LOCALES,
  LOCALE_LABELS,
  LOCALE_FLAGS,
  type AppLocale,
} from "@/i18n/locales";

/**
 * Sprachauswahl — alle unterstützten Sprachen als Grid mit nativen Namen,
 * sofortiges Speichern per Server-Action (Cookie, 1 Jahr).
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("language");

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#161613]/60">{t("hint")}</p>
      {/* auto-rows-fr: alle Karten exakt gleich hoch, egal wie der Text umbricht. */}
      <div className="grid auto-rows-fr gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SUPPORTED_LOCALES.map((l: AppLocale) => {
          const active = locale === l;
          return (
            <form key={l} action={setLocaleAction} className="h-full">
              <input type="hidden" name="locale" value={l} />
              <button
                type="submit"
                aria-pressed={active}
                className={
                  "flex h-full min-h-14 w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-sm leading-snug transition " +
                  (active
                    ? "border-[#161613] bg-white font-semibold text-[#161613] ring-1 ring-[#161613]"
                    : "border-[#161613]/15 text-[#161613]/70 hover:bg-[#161613]/5")
                }
              >
                <span
                  aria-hidden
                  className={
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border " +
                    (active ? "border-[#161613]" : "border-[#161613]/30")
                  }
                >
                  {active && (
                    <span className="h-2 w-2 rounded-full bg-[#161613]" />
                  )}
                </span>
                {/* Runde Flagge (Emoji, kreisförmig zugeschnitten). */}
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#161613]/5 text-[22px] leading-none ring-1 ring-[#161613]/10"
                >
                  {LOCALE_FLAGS[l]}
                </span>
                {/* min-w-0 + break-words: lange Namen wie „(Latinoamérica)"
                    brechen innerhalb der Karte um, statt überzulaufen. */}
                <span className="min-w-0 flex-1 break-words hyphens-auto">
                  {LOCALE_LABELS[l]}
                </span>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
