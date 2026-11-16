// Accept-Language → unterstützte App-Locale. Client-safe, ohne Server-Importe.
//
// Wird nur benutzt, solange der Besucher noch keine Sprache gewählt hat (kein
// gültiges NEXT_LOCALE-Cookie). Eine ausdrückliche Wahl im Sprachwähler hat
// immer Vorrang.

import { SUPPORTED_LOCALES, type AppLocale } from "./locales";

const BY_LOWER = new Map<string, AppLocale>(
  SUPPORTED_LOCALES.map((l) => [l.toLowerCase(), l]),
);

/** Spanische Regionen, die wir als Lateinamerika (es-419) bedienen. */
const LATAM_REGIONS = new Set([
  "419", "ar", "bo", "cl", "co", "cr", "cu", "do", "ec", "gt", "hn", "mx",
  "ni", "pa", "pe", "pr", "py", "sv", "us", "uy", "ve",
]);

/** Englische Regionen, die britisches Englisch näher liegt als US-Englisch. */
const GB_REGIONS = new Set(["gb", "uk", "ie", "au", "nz", "za", "in", "sg", "hk", "mt"]);

const TRADITIONAL_CHINESE_REGIONS = new Set(["tw", "hk", "mo"]);

/** Eine einzelne Sprachangabe (z. B. "de-CH", "zh-Hant-TW") auflösen. */
export function matchLanguageTag(tag: string): AppLocale | null {
  const lower = tag.trim().toLowerCase().replace(/_/g, "-");
  if (!lower || lower === "*") return null;

  const exact = BY_LOWER.get(lower);
  if (exact) return exact;

  const [lang, ...rest] = lower.split("-");
  const subtags = new Set(rest);
  const region = rest.find((s) => s.length === 2 || /^\d{3}$/.test(s));

  switch (lang) {
    case "zh":
      if (subtags.has("hant")) return "zh-Hant";
      if (subtags.has("hans")) return "zh-Hans";
      return region && TRADITIONAL_CHINESE_REGIONS.has(region) ? "zh-Hant" : "zh-Hans";
    case "es":
      return region && LATAM_REGIONS.has(region) ? "es-419" : "es";
    case "en":
      return region && GB_REGIONS.has(region) ? "en-GB" : "en";
    case "pt":
      // Nur brasilianisches Portugiesisch vorhanden — näher als jede andere Sprache.
      return "pt-BR";
    case "no":
    case "nn":
    case "nb":
      return "nb";
    default:
      return BY_LOWER.get(lang ?? "") ?? null;
  }
}

/**
 * Den Accept-Language-Header nach Gewichtung (q) durchgehen und die erste
 * Sprache liefern, die Aera anbietet. `null`, wenn keine passt.
 */
export function matchAcceptLanguage(header: string | null | undefined): AppLocale | null {
  if (!header) return null;
  const entries = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { tag: tag ?? "", q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((e) => e.tag && e.q > 0)
    // Stabile Sortierung: gleiche Gewichtung behält die Reihenfolge des Headers.
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const entry of entries) {
    const match = matchLanguageTag(entry.tag);
    if (match) return match;
  }
  return null;
}
