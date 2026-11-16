/**
 * Hat ein Editor-HTML echten Inhalt? Leere Absätze, `<br>` und geschützte
 * Leerzeichen zählen nicht — sonst fragte der Forum-Editor schon beim leeren
 * Feld nach, ob ein Entwurf verworfen werden soll. Bilder (z. B. GIFs) zählen.
 *
 * Reine Funktion (kein DOM), damit sie im Browser wie im Test gleich läuft.
 */
export function htmlHasText(html: string): boolean {
  if (!html) return false;
  if (/<(img|video|iframe)\b/i.test(html)) return true;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;| /gi, " ")
    .trim();
  return text.length > 0;
}
