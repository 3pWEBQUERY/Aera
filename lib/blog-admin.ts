import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/i18n/locales";
import { env } from "@/lib/env";

/**
 * Zwei Kleinigkeiten, die beide Editor-Seiten brauchen — angelegt, statt sie
 * zweimal zu schreiben.
 */

/** Die Sprachauswahl im Editor: alle Sprachen, in denen es die Oberflaeche gibt. */
export function blogLocaleOptions(): { value: string; label: string }[] {
  return SUPPORTED_LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }));
}

/** Basis fuer die Adressvorschau, z. B. „https://aera.so/blog". */
export function blogUrlBase(): string {
  return `${env.APP_URL.replace(/\/+$/, "")}/blog`;
}
