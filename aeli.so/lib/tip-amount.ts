/**
 * Betraege fuer den Trinkgeld-Baustein.
 *
 * Ohne `server-only`: die Grenzen gelten auf beiden Seiten. Das Formular
 * benutzt sie, um einen Fehler zu zeigen, bevor jemand zu Stripe geschickt
 * wird; die Server-Action benutzt sie, weil das Formular nicht die Wahrheit
 * ist. Zwei Zahlenpaare an zwei Orten waeren die sicherste Art, sie
 * auseinanderlaufen zu lassen.
 */

/**
 * Unter einem Euro lohnt keine Kartenzahlung — Stripes Grundgebuehr fraesse
 * den Betrag auf, und der Creator bekaeme fast nichts.
 */
export const MIN_TIP_CENTS = 100;

/**
 * Nach oben eine Grenze, weil ein Trinkgeld kein Kaufvertrag ist. Wer mehr
 * geben will, soll es tun — dann aber ueber die Community, wo es Belege,
 * Rechnungen und Widerruf gibt.
 */
export const MAX_TIP_CENTS = 50_000;

/** Was der Baustein vorschlaegt, wenn der Creator nichts eingestellt hat. */
export const DEFAULT_TIP_AMOUNTS = [300, 500, 1000];

/**
 * „3", „3,50", „3.50", „  4 " → Cent. Alles andere: `null`.
 *
 * Bewusst streng bei mehr als zwei Nachkommastellen: „3,456" ist keine
 * Eingabe, die jemand so gemeint hat, und stillschweigend zu runden waere bei
 * Geld die falsche Freundlichkeit.
 */
export function parseTipAmount(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number.parseFloat(text) * 100);
  if (!Number.isFinite(cents)) return null;
  return cents;
}

export type TipAmountProblem = "invalid" | "too-small" | "too-large";

/** Prueft einen bereits geparsten Betrag. Getrennt, damit beide Fehler zaehlen. */
export function checkTipAmount(cents: number | null): TipAmountProblem | null {
  if (cents === null) return "invalid";
  if (cents < MIN_TIP_CENTS) return "too-small";
  if (cents > MAX_TIP_CENTS) return "too-large";
  return null;
}
