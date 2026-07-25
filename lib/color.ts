/**
 * Farbeingaben robust auf `#rrggbb` bringen.
 *
 * Menschen tippen und kopieren Farben in sehr verschiedenen Formen: mit und
 * ohne Raute, drei- oder sechsstellig, gross- oder kleingeschrieben, mit
 * Alpha-Anteil aus Figma, als 0x-Literal aus dem Code, als rgb() aus den
 * DevTools — und beim Einfuegen haengt gern ein Leerzeichen oder ein
 * Anfuehrungszeichen dran. Frueher galt nur exakt /^#[0-9a-fA-F]{6}$/, alles
 * andere fiel stillschweigend auf den alten Wert zurueck; genau das liest
 * sich als "meine Farbe wird nicht erkannt".
 *
 * Das Ergebnis ist immer dieselbe kanonische Form, weil die Farbe in
 * style-Attributen, E-Mails und OG-Bildern landet und dort keine Kurzform
 * oder Alpha vertraegt.
 */

const HEX_ONLY = /^[0-9a-f]+$/;

function clampByte(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, "0");
}

/** `#rrggbb` (klein) oder null, wenn sich beim besten Willen keine Farbe erkennen laesst. */
export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== "string") return null;

  // Anfuehrungszeichen und Semikolon kommen beim Kopieren aus CSS mit.
  let s = input.trim().replace(/^["'`]+|["'`;]+$/g, "").trim().toLowerCase();
  if (!s) return null;

  // rgb(…) / rgba(…) — auch mit Prozentwerten, wie die DevTools sie ausgeben.
  const rgb = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channels = parts.slice(0, 3).map((p) =>
      p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p),
    );
    if (channels.some((c) => Number.isNaN(c))) return null;
    return `#${channels.map(clampByte).join("")}`;
  }

  // Fuehrende Raute, 0x-Literal und innere Leerzeichen ("#a1 b2 c3") entfernen.
  s = s.replace(/^#/, "").replace(/^0x/, "").replace(/\s+/g, "");
  if (!HEX_ONLY.test(s)) return null;

  // 4 und 8 Stellen tragen einen Alpha-Kanal, den wir nicht speichern koennen —
  // die Farbe selbst ist trotzdem eindeutig, also nehmen wir sie.
  if (s.length === 4 || s.length === 8) s = s.slice(0, s.length === 4 ? 3 : 6);
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (s.length !== 6) return null;
  return `#${s}`;
}

/** Wie normalizeHexColor, faellt aber auf einen bekannten Wert zurueck. */
export function safeHexColor(input: unknown, fallback: string): string {
  return normalizeHexColor(input) ?? fallback;
}

/**
 * Relative Helligkeit nach WCAG. Wird gebraucht, weil auf der Primaerfarbe
 * weisse Schrift steht (Beitritts-Button, Community-Header) — bei einem hellen
 * Gelb ist die schlicht nicht lesbar.
 */
export function relativeLuminance(hex: string): number {
  const v = normalizeHexColor(hex) ?? "#000000";
  const channel = (i: number) => {
    const c = parseInt(v.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Kontrast von weisser Schrift auf dieser Farbe. Ab 3 ist grosse Schrift lesbar. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}
