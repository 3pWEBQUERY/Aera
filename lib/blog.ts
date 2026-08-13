import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Der Blog von Aera — alles, was Admin-Bereich und oeffentliche Seite
 * gemeinsam brauchen.
 *
 * Bewusst ohne `server-only`: die Adresse eines Beitrags entsteht waehrend des
 * Tippens im Editor, die Rubriken stehen in einem Auswahlfeld. Beides muss im
 * Browser laufen. Was wirklich Server ist — das Bereinigen des HTML — steht in
 * lib/rich-text.ts und wird von hier aus nicht angefasst.
 */

/**
 * Die Rubriken.
 *
 * Absichtlich im Code und nicht in der Datenbank. Eine Rubrikverwaltung waere
 * eine weitere Oberflaeche, die gepflegt werden will, und das Ergebnis kennt
 * man: nach einem Jahr gibt es „Produkt", „Produkte" und „Produkt-News". Ein
 * fester, kurzer Satz haelt die Uebersicht lesbar; eine Rubrik zu ergaenzen ist
 * eine Zeile hier plus ein Eintrag in messages/en.json.
 *
 * Die Schluessel stehen in der Adresse (`/blog?rubrik=produkt`) und sind
 * deshalb deutsch wie die uebrigen oeffentlichen Routen (/hilfe, /impressum).
 * Die Beschriftung kommt uebersetzt aus `blog.categories.<key>`.
 */
export const BLOG_CATEGORIES = [
  "produkt",
  "neuigkeiten",
  "leitfaden",
  "community",
  "technik",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export function isBlogCategory(value: unknown): value is BlogCategory {
  return typeof value === "string" && (BLOG_CATEGORIES as readonly string[]).includes(value);
}

/** Aus einem Formularwert eine gueltige Rubrik machen — oder keine. */
export function parseCategory(value: unknown): BlogCategory | null {
  return isBlogCategory(value) ? value : null;
}

/**
 * Deutsche Umlaute ausschreiben, statt sie wegzuwerfen.
 *
 * `slugify` aus lib/utils.ts zerlegt „ä" in a + Trema und wirft das Trema weg —
 * fuer die meisten Sprachen richtig. Fuer Deutsch nicht: aus „Straße" wird
 * „stra-e" und aus „Größe" „gro-e". Bei einem deutschen Blog steht das dann in
 * jeder zweiten Adresse, deshalb hier eine eigene Runde davor.
 */
const TRANSLITERATIONS: Array<[RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
  [/æ/g, "ae"],
  [/ø/g, "oe"],
  [/å/g, "aa"],
];

export const MAX_SLUG_LENGTH = 80;

export function blogSlug(input: string): string {
  let value = input.toLowerCase().trim();
  for (const [pattern, replacement] of TRANSLITERATIONS) {
    value = value.replace(pattern, replacement);
  }
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/-+$/g, "")
  );
}

/**
 * Eine freie Adresse finden.
 *
 * Der Zaehler haengt hinten dran, statt die Adresse abzulehnen: wer zwei
 * Beitraege „Was neu ist" nennt, will nicht ueber Adressen nachdenken muessen.
 */
export function freeBlogSlug(taken: readonly string[], wish: string): string {
  const base = blogSlug(wish) || "beitrag";
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - 4)}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base.slice(0, MAX_SLUG_LENGTH - 8)}-${Date.now().toString(36)}`;
}

/** Woerter pro Minute — eher langsam gerechnet, damit die Angabe nicht luegt. */
const WORDS_PER_MINUTE = 200;

export function readingMinutes(plainText: string): number {
  const words = plainText.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export const MAX_EXCERPT_LENGTH = 280;

/**
 * Der Anriss.
 *
 * Schneidet an der letzten Wortgrenze, nicht mitten im Wort — ein „Wir haben
 * die Bezahlvorg…" liest sich wie ein Fehler, nicht wie eine Kuerzung.
 */
export function excerptFrom(plainText: string, max = 200): string {
  const clean = plainText.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Welche Beitraege oeffentlich sind.
 *
 * Drei Bedingungen, und die dritte ist die interessante: ein Beitrag mit einem
 * Datum in der Zukunft ist geplant und noch nicht sichtbar. Damit braucht die
 * Zeitplanung weder einen dritten Status noch einen Cronjob — nur einen
 * Vergleich, den die Datenbank ohnehin macht.
 *
 * Diese Bedingung ist der einzige Ort, an dem „oeffentlich" definiert wird.
 * Uebersicht, Beitragsseite, Feed und Sitemap benutzen sie alle.
 */
export function publicPostWhere(now: Date = new Date()): Prisma.PlatformPostWhereInput {
  return {
    status: "PUBLISHED",
    publishedAt: { not: null, lte: now },
  };
}

/** Ein veroeffentlichter Beitrag, dessen Datum noch aussteht. */
export function isScheduled(
  post: { status: string; publishedAt: Date | null },
  now: Date = new Date(),
): boolean {
  return post.status === "PUBLISHED" && post.publishedAt !== null && post.publishedAt > now;
}

/**
 * Die Sprachen, in denen gesucht wird — in dieser Reihenfolge.
 *
 * Wie im Hilfecenter: erst die aktive Sprache, dann Englisch, dann Deutsch.
 * Ein leerer Blog waere fuer einen franzoesischen Besucher schlechter als ein
 * englischer, und ein Beitrag in der falschen Sprache besser als keiner.
 */
export function localeChain(locale: string): string[] {
  return [...new Set([locale, "en", "de"])];
}

/** Beitraege je Seite in der Uebersicht. */
export const POSTS_PER_PAGE = 9;

/** Wie viele Beitraege der Feed ausliefert. */
export const FEED_LIMIT = 20;
