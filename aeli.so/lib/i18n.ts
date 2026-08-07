import "server-only";
import { headers } from "next/headers";
import { PUBLIC_STRINGS, type PublicLocale, type PublicStrings } from "./public-strings";

/**
 * Zwei Sprachen, genau dort, wo sie zählen.
 *
 * Das Studio ist deutsch: es hat einen Nutzer, und der hat sich für Aeli auf
 * einer deutschen Seite registriert. Die ÖFFENTLICHE Seite hat ein Publikum,
 * das der Creator nicht aussucht — dort entscheidet die Sprache des Browsers,
 * ob „Anmelden“ oder „Subscribe“ auf dem Knopf steht.
 *
 * Es gibt bewusst kein Sprach-Präfix in der URL: `marie.aeli.so` ist die
 * Adresse, die auf Visitenkarten steht, und die soll nicht zu `/de/` werden.
 */

/**
 * Erste erkannte Sprache aus `Accept-Language` gewinnt; alles, was nicht
 * Deutsch ist, bekommt Englisch. Das ist keine vollständige Aushandlung — es
 * ist die Entscheidung, dass ein deutschsprachiger Besucher Deutsch sieht und
 * alle anderen etwas, das sie sicher lesen können.
 */
export async function publicLocale(): Promise<PublicLocale> {
  const header = (await headers()).get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]!.trim().toLowerCase();
    if (tag.startsWith("de")) return "de";
    if (tag.startsWith("en")) return "en";
  }
  return "de";
}

export async function publicStrings(): Promise<PublicStrings> {
  return PUBLIC_STRINGS[await publicLocale()];
}
