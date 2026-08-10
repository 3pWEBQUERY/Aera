import { parseBlockConfig } from "./blocks";
import { parseTheme, resolveTheme, type AeliTheme } from "./themes";
import type { PageBlock, PageCard } from "@/components/page/types";
import type { AeliBlockType } from "@/app/generated/prisma/client";

/**
 * Von der Datenbankzeile zur Karte, wie sie gerendert wird.
 *
 * Der ganze Zweck dieser Datei ist eine einzige Regel, und die soll an genau
 * einer Stelle stehen:
 *
 *   Eine Karte ohne eigenes Theme erbt das der Seite.
 *
 * „Erbt" heisst hier: sie bekommt es beim Laden, nicht beim Speichern. Wuerde
 * das Studio das Seiten-Theme in jede Karte kopieren, sobald sie angelegt
 * wird, liesse sich der Stapel nie wieder an einer Stelle umfaerben — und
 * genau das will man, wenn man ein Design aendert.
 *
 * Ohne `server-only`: die Vorschau im Studio baut Karten im Client, wenn der
 * Creator am Design zieht und noch nichts gespeichert ist.
 */

export interface CardRow {
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  /** Roh aus der Datenbank. `null` heisst „wie die Seite". */
  theme: unknown;
  blocks: BlockRow[];
}

export interface BlockRow {
  id: string;
  type: AeliBlockType;
  title: string | null;
  subtitle: string | null;
  href: string | null;
  mediaUrl: string | null;
  icon: string | null;
  config: unknown;
}

export function toPageBlock(block: BlockRow): PageBlock {
  return {
    id: block.id,
    type: block.type,
    title: block.title,
    subtitle: block.subtitle,
    href: block.href,
    mediaUrl: block.mediaUrl,
    icon: block.icon,
    config: parseBlockConfig(block.config),
  };
}

export function toPageCard(card: CardRow, pageTheme: AeliTheme): PageCard {
  const ownTheme = card.theme !== null && card.theme !== undefined;
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    icon: card.icon,
    theme: resolveTheme(ownTheme ? parseTheme(card.theme) : pageTheme),
    ownTheme,
    blocks: card.blocks.map(toPageBlock),
  };
}

export function toPageCards(cards: CardRow[], pageTheme: AeliTheme): PageCard[] {
  return cards.map((card) => toPageCard(card, pageTheme));
}

/**
 * Welche Karte beim Oeffnen im Bild steht.
 *
 * Ein unbekannter Slug ergibt die erste Karte, nicht einen Fehler: eine
 * umbenannte Karte soll einen alten Link nicht ins Leere laufen lassen,
 * sondern auf den Stapel — dort findet man sie wieder.
 */
export function cardIndexBySlug(cards: { slug: string }[], slug: string | undefined): number {
  if (!slug) return 0;
  const index = cards.findIndex((card) => card.slug === slug);
  return index < 0 ? 0 : index;
}

/**
 * Aus einem Titel eine Adresse machen.
 *
 * Bewusst enger als `normalizeHandle`: hier gibt es keine Umlautregeln zu
 * beachten, aber es gibt reservierte Woerter. `karte-` ist der Anker im HTML,
 * und ein Slug, der leer bleibt, waere keine Adresse.
 */
export function normalizeCardSlug(input: string): string {
  const slug = input
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug;
}

/**
 * Ein freier Slug fuer diese Seite.
 *
 * Zwei Karten „Shop" sind keine Kollision, die man dem Creator vorhalten
 * muesste — sie bekommen `shop` und `shop-2`. Nur bei einem leeren Titel gibt
 * es nichts abzuleiten, dann heisst die Karte `karte`.
 */
export function freeCardSlug(taken: string[], wish: string): string {
  const base = normalizeCardSlug(wish) || "karte";
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 200; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
