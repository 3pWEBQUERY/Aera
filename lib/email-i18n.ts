import "server-only";
import { getTranslations } from "next-intl/server";
import { matchAcceptLanguage, matchLanguageTag } from "@/i18n/accept-language";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from "@/i18n/locales";

/**
 * Sprache einer E-Mail: die des Empfängers, nicht die des Requests.
 *
 * Gespeichert wird sie in `User.locale` (Registrierung, Sprachwähler). Fehlt
 * sie — Altkonten, frisch eingeladene Konten —, entscheidet der nächstbeste
 * Hinweis, den der Aufrufer kennt (Request-Sprache, Accept-Language, Sprache
 * des Community-Inhabers), am Ende die Plattform-Sprache.
 */

/** Erste unterstützte Sprache aus den Kandidaten; `null`, wenn keine passt. */
export function pickSupportedLocale(...candidates: Array<string | null | undefined>): AppLocale | null {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    if ((SUPPORTED_LOCALES as readonly string[]).includes(value)) return value as AppLocale;
    const matched = matchLanguageTag(value);
    if (matched) return matched;
  }
  return null;
}

/** Wie pickSupportedLocale, fällt aber auf die Plattform-Sprache zurück. */
export function resolveEmailLocale(...candidates: Array<string | null | undefined>): AppLocale {
  return pickSupportedLocale(...candidates) ?? DEFAULT_LOCALE;
}

/** Sprache aus einem Mobile-Request: Body-Feld vor Accept-Language. */
export function localeFromMobileRequest(req: Request, bodyLocale?: string | null): AppLocale | null {
  return (
    pickSupportedLocale(bodyLocale) ??
    matchAcceptLanguage(req.headers.get("accept-language"))
  );
}

/** Übersetzer für `ui.emails` in genau dieser Sprache (unabhängig vom Cookie). */
export function emailTranslator(locale: AppLocale) {
  return getTranslations({ locale, namespace: "ui.emails" });
}

export interface UnsubscribeCopy {
  /** Grund der Zustellung: „Du erhältst diese E-Mail, weil …“. */
  reason: string;
  /** Linktext: „Newsletter abbestellen“. */
  label: string;
}

/**
 * Texte für Fußzeile und Abmeldelink einer Marketing-Mail. Newsletter und
 * Automationen hängen an derselben Einwilligung (NewsletterConsent), daher
 * ein Satz für beide.
 */
export async function marketingEmailCopy(locale: AppLocale, community: string): Promise<{
  footerLabel: string;
  unsubscribe: UnsubscribeCopy;
}> {
  const t = await emailTranslator(locale);
  return {
    footerLabel: t("sentVia"),
    unsubscribe: {
      reason: t("unsubscribeReason", { community }),
      label: t("unsubscribeLabel"),
    },
  };
}
