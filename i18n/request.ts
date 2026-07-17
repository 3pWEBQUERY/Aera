import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import {
  FALLBACK_LOCALE,
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  normalizeLocale,
} from "./locales";

// Re-Export für bestehende Importe (Actions, Tests).
export { SUPPORTED_LOCALES, LOCALE_COOKIE, normalizeLocale };
export { DEFAULT_LOCALE, type AppLocale } from "./locales";

/**
 * i18n ohne URL-Routing: Die Sprache kommt aus dem `NEXT_LOCALE`-Cookie
 * (Umschalter im Mitgliedskonto). Default ist Deutsch — die Plattform-Sprache.
 *
 * Die UI-Migration ist abgeschlossen. Neue UI- und E-Mail-Texte werden immer
 * in messages/de.json + en.json angelegt; alle weiteren Kataloge können
 * fehlende Texte kontrolliert über den Deep-Merge aus Englisch erben.
 */

type Messages = Record<string, unknown>;

function deepMerge(base: Messages, overlay: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    if (
      value &&
      typeof value === "object" &&
      existing &&
      typeof existing === "object"
    ) {
      out[key] = deepMerge(existing as Messages, value as Messages);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Fallback-Kette pro Locale: en → Elternsprache (falls vorhanden) → Locale.
 * Beispiel es-419: en → es → es-419. So braucht eine Regional-Variante nur
 * ihre tatsächlichen Abweichungen zu pflegen.
 */
export function localeChain(locale: string): string[] {
  const chain: string[] = [FALLBACK_LOCALE];
  const parent = locale.split("-")[0]!;
  if (
    parent !== locale &&
    parent !== FALLBACK_LOCALE &&
    (SUPPORTED_LOCALES as readonly string[]).includes(parent)
  ) {
    chain.push(parent);
  }
  if (locale !== FALLBACK_LOCALE) chain.push(locale);
  return chain;
}

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  // Explizite Locale (z. B. getTranslations({ locale }) in API-Routen ohne
  // Cookie-Kontext — Mobile-API) hat Vorrang vor dem NEXT_LOCALE-Cookie.
  const locale = explicitLocale
    ? normalizeLocale(explicitLocale)
    : normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);

  let messages: Messages = {};
  for (const step of localeChain(locale)) {
    messages = deepMerge(
      messages,
      (await import(`../messages/${step}.json`)).default as Messages,
    );
  }

  return { locale, messages };
});
