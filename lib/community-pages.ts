import { safeLinkHref, slugify } from "./utils";

/**
 * Die Inhaltsbausteine frei gebauter Community-Seiten.
 *
 * Liegt hier und nicht in der Editor- oder der Anzeigekomponente, weil drei
 * Stellen dieselbe Wahrheit brauchen: der Editor baut die Bausteine, die
 * Server-Action prueft sie beim Speichern nach, und die oeffentliche Seite
 * zeichnet sie. Ein vierter Ort waere die naechste Gelegenheit fuer eine
 * Abweichung, die erst beim Nutzer auffaellt.
 *
 * Was hier fehlt, fehlt mit Absicht: eingebettete Fremdinhalte (YouTube,
 * Spotify, Codepen). Die Content-Security-Policy der Plattform erlaubt
 * `frame-src 'self'` — ein solcher Baustein liesse sich bauen, bliebe im
 * Browser aber leer. Bewegtbild laeuft deshalb ueber die vorhandene
 * Upload-Strecke und ein natives <video>.
 */

export const PAGE_BLOCK_TYPES = [
  "TEXT",
  "IMAGE",
  "GALLERY",
  "VIDEO",
  "QUOTE",
  "FAQ",
  "CTA",
  "LINKS",
  "STATS",
  "DIVIDER",
] as const;

export type PageBlockType = (typeof PAGE_BLOCK_TYPES)[number];

/** Breite eines Bildes im Lesefluss. */
export type BlockWidth = "INSET" | "WIDE" | "FULL";
export type CtaStyle = "SOLID" | "OUTLINE";
export type DividerStyle = "LINE" | "SPACE" | "DOTS";
export type GalleryLayout = "GRID" | "ROW";

export interface TextBlock {
  id: string;
  type: "TEXT";
  title: string;
  /** Vom Editor erzeugtes HTML. Wird serverseitig durch den Allowlist-Filter geschickt. */
  html: string;
}

export interface ImageBlock {
  id: string;
  type: "IMAGE";
  url: string;
  alt: string;
  caption: string;
  width: BlockWidth;
}

export interface GalleryImage {
  id: string;
  url: string;
  alt: string;
}

export interface GalleryBlock {
  id: string;
  type: "GALLERY";
  title: string;
  layout: GalleryLayout;
  images: GalleryImage[];
}

export interface VideoBlock {
  id: string;
  type: "VIDEO";
  url: string;
  posterUrl: string;
  title: string;
  caption: string;
}

export interface QuoteBlock {
  id: string;
  type: "QUOTE";
  text: string;
  author: string;
  role: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqBlock {
  id: string;
  type: "FAQ";
  title: string;
  items: FaqItem[];
}

export interface CtaBlock {
  id: string;
  type: "CTA";
  title: string;
  text: string;
  label: string;
  href: string;
  style: CtaStyle;
}

export interface LinkItem {
  id: string;
  label: string;
  description: string;
  href: string;
}

export interface LinksBlock {
  id: string;
  type: "LINKS";
  title: string;
  items: LinkItem[];
}

export interface StatItem {
  id: string;
  value: string;
  label: string;
}

export interface StatsBlock {
  id: string;
  type: "STATS";
  title: string;
  items: StatItem[];
}

export interface DividerBlock {
  id: string;
  type: "DIVIDER";
  style: DividerStyle;
}

export type PageBlock =
  | TextBlock
  | ImageBlock
  | GalleryBlock
  | VideoBlock
  | QuoteBlock
  | FaqBlock
  | CtaBlock
  | LinksBlock
  | StatsBlock
  | DividerBlock;

/* ------------------------------------------------------------------ Grenzen */

/**
 * Obergrenzen. Sie schuetzen nicht vor boesem Willen — dagegen hilft die
 * Autorisierung —, sondern vor dem versehentlich in ein Feld geworfenen
 * Roman, der die Zeile in der Datenbank und damit jede Seitenabfrage aufblaeht.
 */
export const MAX_BLOCKS = 40;
export const MAX_PAGES = 20;
export const MAX_TITLE = 80;
export const MAX_SLUG = 60;
export const MAX_DESCRIPTION = 300;
const MAX_HTML = 20_000;
const MAX_LINE = 200;
const MAX_TEXT = 2_000;
const MAX_URL = 500;
const MAX_GALLERY_IMAGES = 24;
const MAX_LIST_ITEMS = 20;
const MAX_STATS = 6;

/* ----------------------------------------------------------------- Parsing */

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Wie `safeLinkHref`, aber ohne `mailto:` — fuer Bild- und Videoquellen. */
function safeMediaUrl(value: unknown, max: number): string {
  const href = safeLinkHref(value, max);
  return href.startsWith("mailto:") ? "" : href;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Erzeugt eine Kennung fuer einen Baustein.
 *
 * `crypto.randomUUID` gibt es im Browser erst ab sicherem Kontext und in
 * aelteren Safaris gar nicht; ein Baustein ohne Kennung waere im Editor nicht
 * mehr sortierbar. Der Rueckfall reicht: die Kennung muss nur innerhalb einer
 * Seite eindeutig sein, nicht weltweit.
 */
export function newBlockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Kennungen sind nur innerhalb einer Liste eindeutig — Doppelte werden ersetzt. */
function uniqueId(raw: unknown, seen: Set<string>): string {
  const candidate = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 64) : newBlockId();
  const id = seen.has(candidate) ? newBlockId() : candidate;
  seen.add(id);
  return id;
}

function parseList<T>(
  raw: unknown,
  max: number,
  parse: (entry: Record<string, unknown>, id: string) => T,
): T[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .slice(0, max)
    .map((e) => parse(e, uniqueId(e.id, seen)));
}

/**
 * Liest gespeicherte Bausteine zurueck.
 *
 * Nimmt alles entgegen und gibt immer eine gueltige Liste zurueck: die Spalte
 * ist ein JSON-Feld, das aelteren Code, aeltere Editorstaende und
 * Handbearbeitung ueberlebt haben kann. Unbekannte Typen fallen weg, statt die
 * Seite abstuerzen zu lassen.
 */
export function parsePageBlocks(raw: unknown): PageBlock[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PageBlock[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (!PAGE_BLOCK_TYPES.includes(e.type as PageBlockType)) continue;
    const id = uniqueId(e.id, seen);

    switch (e.type as PageBlockType) {
      case "TEXT":
        out.push({ id, type: "TEXT", title: str(e.title, MAX_LINE), html: str(e.html, MAX_HTML) });
        break;
      case "IMAGE":
        out.push({
          id,
          type: "IMAGE",
          url: safeMediaUrl(e.url, MAX_URL),
          alt: str(e.alt, MAX_LINE),
          caption: str(e.caption, MAX_LINE),
          width: pick<BlockWidth>(e.width, ["INSET", "WIDE", "FULL"], "WIDE"),
        });
        break;
      case "GALLERY":
        out.push({
          id,
          type: "GALLERY",
          title: str(e.title, MAX_LINE),
          layout: pick<GalleryLayout>(e.layout, ["GRID", "ROW"], "GRID"),
          images: parseList(e.images, MAX_GALLERY_IMAGES, (img, imgId) => ({
            id: imgId,
            url: safeMediaUrl(img.url, MAX_URL),
            alt: str(img.alt, MAX_LINE),
          })).filter((img) => img.url),
        });
        break;
      case "VIDEO":
        out.push({
          id,
          type: "VIDEO",
          url: safeMediaUrl(e.url, MAX_URL),
          posterUrl: safeMediaUrl(e.posterUrl, MAX_URL),
          title: str(e.title, MAX_LINE),
          caption: str(e.caption, MAX_LINE),
        });
        break;
      case "QUOTE":
        out.push({
          id,
          type: "QUOTE",
          text: str(e.text, MAX_TEXT),
          author: str(e.author, MAX_LINE),
          role: str(e.role, MAX_LINE),
        });
        break;
      case "FAQ":
        out.push({
          id,
          type: "FAQ",
          title: str(e.title, MAX_LINE),
          items: parseList(e.items, MAX_LIST_ITEMS, (item, itemId) => ({
            id: itemId,
            question: str(item.question, MAX_LINE),
            answer: str(item.answer, MAX_TEXT),
          })),
        });
        break;
      case "CTA":
        out.push({
          id,
          type: "CTA",
          title: str(e.title, MAX_LINE),
          text: str(e.text, MAX_TEXT),
          label: str(e.label, MAX_LINE),
          href: safeLinkHref(e.href, MAX_URL),
          style: pick<CtaStyle>(e.style, ["SOLID", "OUTLINE"], "SOLID"),
        });
        break;
      case "LINKS":
        out.push({
          id,
          type: "LINKS",
          title: str(e.title, MAX_LINE),
          items: parseList(e.items, MAX_LIST_ITEMS, (item, itemId) => ({
            id: itemId,
            label: str(item.label, MAX_LINE),
            description: str(item.description, MAX_LINE),
            href: safeLinkHref(item.href, MAX_URL),
          })),
        });
        break;
      case "STATS":
        out.push({
          id,
          type: "STATS",
          title: str(e.title, MAX_LINE),
          items: parseList(e.items, MAX_STATS, (item, itemId) => ({
            id: itemId,
            value: str(item.value, 24),
            label: str(item.label, MAX_LINE),
          })),
        });
        break;
      case "DIVIDER":
        out.push({
          id,
          type: "DIVIDER",
          style: pick<DividerStyle>(e.style, ["LINE", "SPACE", "DOTS"], "LINE"),
        });
        break;
    }
    if (out.length >= MAX_BLOCKS) break;
  }

  return out;
}

/** Frischer Baustein fuer den Editor — alle Felder leer, aber vollstaendig. */
export function emptyBlock(type: PageBlockType): PageBlock {
  const id = newBlockId();
  switch (type) {
    case "TEXT":
      return { id, type, title: "", html: "" };
    case "IMAGE":
      return { id, type, url: "", alt: "", caption: "", width: "WIDE" };
    case "GALLERY":
      return { id, type, title: "", layout: "GRID", images: [] };
    case "VIDEO":
      return { id, type, url: "", posterUrl: "", title: "", caption: "" };
    case "QUOTE":
      return { id, type, text: "", author: "", role: "" };
    case "FAQ":
      return {
        id,
        type,
        title: "",
        items: [{ id: newBlockId(), question: "", answer: "" }],
      };
    case "CTA":
      return { id, type, title: "", text: "", label: "", href: "", style: "SOLID" };
    case "LINKS":
      return {
        id,
        type,
        title: "",
        items: [{ id: newBlockId(), label: "", description: "", href: "" }],
      };
    case "STATS":
      return {
        id,
        type,
        title: "",
        items: [{ id: newBlockId(), value: "", label: "" }],
      };
    case "DIVIDER":
      return { id, type, style: "LINE" };
  }
}

/**
 * Baustein ohne Inhalt?
 *
 * Die Anzeige ueberspringt solche Bausteine, statt eine leere Ueberschrift und
 * viel Luft zu zeichnen. Ein Trenner ist nie leer — er *ist* die Luft.
 */
export function isBlockEmpty(block: PageBlock): boolean {
  switch (block.type) {
    case "TEXT":
      return !block.html.trim() && !block.title.trim();
    case "IMAGE":
      return !block.url.trim();
    case "GALLERY":
      return block.images.length === 0;
    case "VIDEO":
      return !block.url.trim();
    case "QUOTE":
      return !block.text.trim();
    case "FAQ":
      return block.items.every((i) => !i.question.trim() && !i.answer.trim());
    case "CTA":
      return !block.title.trim() && !block.label.trim();
    case "LINKS":
      return block.items.every((i) => !i.label.trim() && !i.href.trim());
    case "STATS":
      return block.items.every((i) => !i.value.trim() && !i.label.trim());
    case "DIVIDER":
      return false;
  }
}

/* -------------------------------------------------------------- Adressteil */

/**
 * Wortmarke aus einem Titel. Faellt auf "seite" zurueck, damit eine Seite mit
 * rein nicht-lateinischem Titel ("关于我们") nicht ohne Adresse dasteht — die
 * eigentliche Eindeutigkeit stellt `uniquePageSlug` her.
 */
export function pageSlugFrom(title: string): string {
  const base = slugify(title).slice(0, MAX_SLUG);
  return base && base !== "untitled" ? base : "seite";
}

/** Haengt -2, -3, … an, bis der Adressteil in der Community frei ist. */
export function uniquePageSlug(desired: string, taken: readonly string[]): string {
  const used = new Set(taken);
  const base = desired.slice(0, MAX_SLUG) || "seite";
  if (!used.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_SLUG - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, MAX_SLUG - 9)}-${newBlockId().slice(0, 8)}`;
}

/* ---------------------------------------------------------------- Reiter */

/** Was das Reitermenue unter dem Kopfbereich braucht — mehr nicht. */
export interface PageNavEntry {
  slug: string;
  title: string;
}
