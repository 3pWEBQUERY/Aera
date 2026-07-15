// Unterstützte Sprachen — client-safe (keine Server-Imports).
//
// Fallback-Modell: Fehlende Keys eines Katalogs fallen auf Englisch zurück
// (Deep-Merge in i18n/request.ts). Neue Texte müssen daher IMMER in
// messages/de.json UND messages/en.json gepflegt werden; die übrigen
// Kataloge ziehen nach und dürfen zwischenzeitlich unvollständig sein.

export const SUPPORTED_LOCALES = [
  "de",
  "en", // English (United States)
  "en-GB",
  "da",
  "es", // Español (España)
  "es-419", // Español (Latinoamérica)
  "fr",
  "it",
  "nl",
  "nb", // Norsk (Bokmål)
  "pl",
  "pt-BR",
  "sv",
  "ru",
  "uk",
  "ja",
  "zh-Hans",
  "zh-Hant",
  "ko",
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "de";
export const FALLBACK_LOCALE: AppLocale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Native Anzeigenamen (für den Sprachwähler). */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  de: "Deutsch",
  en: "English (United States)",
  "en-GB": "English (United Kingdom)",
  da: "Dansk",
  es: "Español (España)",
  "es-419": "Español (Latinoamérica)",
  fr: "Français",
  it: "Italiano",
  nl: "Nederlands",
  nb: "Norsk (Bokmål)",
  pl: "Polski",
  "pt-BR": "Português (Brasil)",
  sv: "Svenska",
  ru: "Русский",
  uk: "Українська",
  ja: "日本語",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  ko: "한국어",
};

/**
 * Englische Sprachnamen — für KI-Prompts (Gemini versteht englische
 * Sprachbezeichnungen am zuverlässigsten und antwortet dann in dieser Sprache).
 */
export const LOCALE_ENGLISH_NAMES: Record<AppLocale, string> = {
  de: "German",
  en: "English",
  "en-GB": "British English",
  da: "Danish",
  es: "Spanish",
  "es-419": "Latin American Spanish",
  fr: "French",
  it: "Italian",
  nl: "Dutch",
  nb: "Norwegian (Bokmål)",
  pl: "Polish",
  "pt-BR": "Brazilian Portuguese",
  sv: "Swedish",
  ru: "Russian",
  uk: "Ukrainian",
  ja: "Japanese",
  "zh-Hans": "Simplified Chinese",
  "zh-Hant": "Traditional Chinese",
  ko: "Korean",
};

/**
 * Runde SVG-Flaggen für den Sprachwähler (public/flags/, circle-flags, MIT).
 * Kreisförmig beschnittene Vektoren — füllen den Kreis vollständig und sehen
 * auf allen Plattformen identisch aus (keine Emoji-Inkonsistenzen).
 */
export const LOCALE_FLAGS: Record<AppLocale, string> = {
  de: "/flags/de.svg",
  en: "/flags/us.svg",
  "en-GB": "/flags/gb.svg",
  da: "/flags/dk.svg",
  es: "/flags/es.svg",
  "es-419": "/flags/mx.svg",
  fr: "/flags/fr.svg",
  it: "/flags/it.svg",
  nl: "/flags/nl.svg",
  nb: "/flags/no.svg",
  pl: "/flags/pl.svg",
  "pt-BR": "/flags/br.svg",
  sv: "/flags/se.svg",
  ru: "/flags/ru.svg",
  uk: "/flags/ua.svg",
  ja: "/flags/jp.svg",
  "zh-Hans": "/flags/cn.svg",
  "zh-Hant": "/flags/tw.svg",
  ko: "/flags/kr.svg",
};

export function normalizeLocale(value: string | undefined | null): AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale)
    ? (value as AppLocale)
    : DEFAULT_LOCALE;
}
