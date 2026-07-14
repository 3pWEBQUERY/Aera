import { getTranslations } from "next-intl/server";

/**
 * Übersetzer für Server-Action-Fehlertexte (Namespace `errors`). Die Sprache
 * stammt aus dem `NEXT_LOCALE`-Cookie (siehe i18n/request.ts), fehlende Keys
 * fallen automatisch auf Englisch zurück.
 */
export function getErrorTranslator() {
  return getTranslations("errors");
}

export type ErrorT = Awaited<ReturnType<typeof getErrorTranslator>>;

/**
 * Übersetzt die erste Zod-Fehlermeldung. Zod-Schemas liefern statt Klartext
 * einen Key aus dem `errors`-Namespace (z. B. "emailInvalid"); Meldungen ohne
 * eigenen Key (Zod-Defaults) fallen auf "invalidInput" zurück.
 */
export function zodError(
  t: ErrorT,
  result: { error: { issues: { message?: string }[] } },
): string {
  const message = result.error.issues[0]?.message;
  return message && t.has(message) ? t(message) : t("invalidInput");
}

/**
 * Self-contained Kurzform: holt den Übersetzer und gibt den Fehlertext zurück.
 * Praktisch für Actions mit vielen Fehlerpfaden (kein lokales `t` nötig).
 */
export async function tErr(
  key: string,
  values?: Record<string, string | number>,
): Promise<string> {
  const t = await getErrorTranslator();
  return t(key, values);
}

/** Self-contained Variante von zodError(). */
export async function zodErr(result: {
  error: { issues: { message?: string }[] };
}): Promise<string> {
  return zodError(await getErrorTranslator(), result);
}
