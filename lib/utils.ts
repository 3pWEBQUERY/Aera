// Small, dependency-free helpers used across the app.

import { PLATFORM_CURRENCY } from "./currency";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}

// Locale-Parameter (Default "de"): migrierte Oberflächen reichen die aktive
// Sprache (useLocale/getLocale) durch; alte Aufrufer bleiben deutsch. Der
// `freeLabel` erlaubt es, das "Kostenlos" für den 0-Fall zu lokalisieren.
export function formatPrice(
  cents: number,
  currency: string = PLATFORM_CURRENCY,
  locale = "de",
  freeLabel = "Kostenlos",
): string {
  if (!cents) return freeLabel;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

// Locale-Parameter (Default "de"): migrierte Oberflächen reichen die aktive
// Sprache (useLocale/getLocale) durch; alte Aufrufer bleiben deutsch.
export function formatDate(d: Date | string, locale = "de"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(d: Date | string, locale = "de"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function timeAgo(d: Date | string, locale = "de"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (sec < 60) return rtf.format(0, "second"); // „jetzt“ / "now"
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return rtf.format(-hrs, "hour");
  const days = Math.floor(hrs / 24);
  if (days < 30) return rtf.format(-days, "day");
  return formatDate(date, locale);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function excerpt(text: string, len = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > len ? clean.slice(0, len).trimEnd() + "…" : clean;
}
