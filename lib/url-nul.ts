/**
 * NUL-Bytes in Adressen.
 *
 * PostgreSQL lehnt `\0` in Text ab (Fehler 22021). Ein `%00` in Pfad oder
 * Suchparameter landete deshalb bis in eine Abfrage und endete als 500 —
 * `/c/%00`, `/c/x/p/%00`, `?q=%00`. Kein echter Slug, keine echte Suche
 * enthaelt ein NUL; der Proxy faengt es deshalb einmal zentral ab, bevor
 * irgendeine Seite es sieht:
 *
 * - im Pfad: 404 (es gibt diese Adresse nicht),
 * - in der Suche: Weiterleitung auf dieselbe Adresse ohne das Zeichen.
 */

/** `%00` (kodiert) oder ein rohes NUL. */
const NUL = /%00|\u0000/;

export function pathHasNul(pathname: string): boolean {
  return NUL.test(pathname);
}

/**
 * Suchteil ohne NUL — oder `null`, wenn nichts zu tun ist.
 * Leere Parameter bleiben stehen (`?q=` statt `?q=%00`): die Seite soll sich
 * verhalten wie bei einer leeren Suche.
 */
export function searchWithoutNul(search: string): string | null {
  if (!NUL.test(search)) return null;
  const cleaned = search.replace(/%00|\u0000/g, "");
  return cleaned === "?" ? "" : cleaned;
}

/** Fuer Werte, die schon dekodiert sind (searchParams, Formularfelder). */
export function stripNul(value: string): string {
  return value.replace(/\u0000/g, "");
}
