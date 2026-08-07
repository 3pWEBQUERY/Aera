import { z } from "zod";
import type { AeliBlockType } from "@/app/generated/prisma/client";

/**
 * Der Baukasten.
 *
 * Ein Block ist die kleinste Einheit, die ein Creator anfassen kann. Die
 * gemeinsamen Felder (`title`, `href`, `mediaUrl`, …) liegen als Spalten in
 * der Tabelle, alles Typspezifische in `config`. Diese Datei ist die einzige
 * Stelle, die weiss, welcher Typ welches Feld ueberhaupt liest — Editor,
 * oeffentliche Seite und Validierung ziehen alle von hier.
 */

export type BlockGroup = "basis" | "medien" | "community" | "geld" | "kontakt";

export interface BlockDescriptor {
  type: AeliBlockType;
  label: string;
  /** Ein Satz in der Auswahl. Sagt, was der Block TUT, nicht wie er heisst. */
  hint: string;
  icon: string;
  group: BlockGroup;
  /** Ohne Ziel ist der Block sinnlos — der Editor markiert ihn dann als unfertig. */
  needsHref: boolean;
  /** Braucht eine verknuepfte Aera-Community, sonst nicht anlegbar. */
  needsCommunity: boolean;
  defaults: { title?: string; subtitle?: string };
}

export const BLOCK_GROUPS: { key: BlockGroup; label: string }[] = [
  { key: "basis", label: "Basis" },
  { key: "medien", label: "Medien" },
  { key: "kontakt", label: "Kontakt" },
  { key: "geld", label: "Verdienen" },
  { key: "community", label: "Community" },
];

export const BLOCK_CATALOG: readonly BlockDescriptor[] = [
  {
    type: "LINK",
    label: "Link",
    hint: "Ein Ziel, ein Titel. Der Baustein, aus dem die meisten Seiten bestehen.",
    icon: "→",
    group: "basis",
    needsHref: true,
    needsCommunity: false,
    defaults: { title: "Neuer Link" },
  },
  {
    type: "HEADER",
    label: "Überschrift",
    hint: "Gliedert lange Seiten in Abschnitte.",
    icon: "H",
    group: "basis",
    needsHref: false,
    needsCommunity: false,
    defaults: { title: "Abschnitt" },
  },
  {
    type: "TEXT",
    label: "Text",
    hint: "Ein kurzer Absatz — eine Ansage, ein Hinweis, ein Zitat.",
    icon: "¶",
    group: "basis",
    needsHref: false,
    needsCommunity: false,
    defaults: { title: "" },
  },
  {
    type: "DIVIDER",
    label: "Trenner",
    hint: "Eine Linie Luft zwischen zwei Gruppen.",
    icon: "—",
    group: "basis",
    needsHref: false,
    needsCommunity: false,
    defaults: {},
  },
  {
    type: "SOCIAL_ROW",
    label: "Social-Zeile",
    hint: "Deine Profile als Icon-Reihe statt als sechs einzelne Karten.",
    icon: "◎",
    group: "basis",
    needsHref: false,
    needsCommunity: false,
    defaults: {},
  },
  {
    type: "IMAGE",
    label: "Bild",
    hint: "Ein Bild über die volle Breite, optional verlinkt.",
    icon: "▣",
    group: "medien",
    needsHref: false,
    needsCommunity: false,
    defaults: {},
  },
  {
    type: "EMBED",
    label: "Einbettung",
    hint: "YouTube, Vimeo, Twitch — spielt direkt auf der Seite.",
    icon: "▶",
    group: "medien",
    needsHref: false,
    needsCommunity: false,
    defaults: { title: "Ansehen" },
  },
  {
    type: "MUSIC",
    label: "Musik",
    hint: "Spotify, Apple Music, SoundCloud — mit Player statt nur Link.",
    icon: "♫",
    group: "medien",
    needsHref: false,
    needsCommunity: false,
    defaults: { title: "Anhören" },
  },
  {
    type: "NEWSLETTER",
    label: "Newsletter",
    hint: "Sammelt E-Mail-Adressen direkt auf der Seite.",
    icon: "✉",
    group: "kontakt",
    needsHref: false,
    needsCommunity: false,
    defaults: { title: "Bleib auf dem Laufenden", subtitle: "Kein Spam. Abmeldung jederzeit." },
  },
  {
    type: "CONTACT",
    label: "Kontakt",
    hint: "Ein kleines Formular für Anfragen — ohne deine Adresse zu zeigen.",
    icon: "✎",
    group: "kontakt",
    needsHref: false,
    needsCommunity: false,
    defaults: { title: "Schreib mir" },
  },
  {
    type: "QR_SHARE",
    label: "QR-Code",
    hint: "Deine Seite zum Abfotografieren — auf Bühnen und Messen Gold wert.",
    icon: "⬚",
    group: "kontakt",
    needsHref: false,
    needsCommunity: false,
    defaults: { title: "Seite teilen" },
  },
  {
    type: "TIP",
    label: "Trinkgeld",
    hint: "Ein Betrag, ein Klick, fertig.",
    icon: "♡",
    group: "geld",
    needsHref: true,
    needsCommunity: false,
    defaults: { title: "Unterstütze mich" },
  },
  {
    type: "PRODUCT",
    label: "Produkt",
    hint: "Bild, Preis, Kaufen-Knopf.",
    icon: "⬢",
    group: "geld",
    needsHref: true,
    needsCommunity: false,
    defaults: { title: "Neues Produkt" },
  },
  {
    type: "BOOKING",
    label: "Termin",
    hint: "Führt direkt in deinen Buchungskalender.",
    icon: "▤",
    group: "geld",
    needsHref: true,
    needsCommunity: false,
    defaults: { title: "Termin buchen" },
  },
  {
    type: "COMMUNITY_CTA",
    label: "Community",
    hint: "Die Brücke in deine Aera-Community — beitreten statt nur klicken.",
    icon: "◈",
    group: "community",
    needsHref: false,
    needsCommunity: true,
    defaults: { title: "Community beitreten" },
  },
  {
    type: "LIVE_NOW",
    label: "Jetzt live",
    hint: "Erscheint nur, solange in deiner Community wirklich gesendet wird.",
    icon: "●",
    group: "community",
    needsHref: false,
    needsCommunity: true,
    defaults: { title: "Jetzt live" },
  },
] as const;

export function blockDescriptor(type: AeliBlockType): BlockDescriptor {
  return BLOCK_CATALOG.find((entry) => entry.type === type) ?? BLOCK_CATALOG[0]!;
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

/**
 * Ein gemeinsames, offenes Schema statt eines pro Typ.
 *
 * Der Grund ist der Editor: wer einen Block von LINK auf PRODUCT umstellt,
 * soll seinen Preis nicht verlieren, weil ein strenges Schema ihn beim
 * Zwischenspeichern weggeworfen hat. Gelesen wird ohnehin nur, was der
 * jeweilige Typ kennt — ungenutzte Felder schaden nicht.
 */
export const blockConfigSchema = z
  .object({
    /** LINK: hebt die Karte optisch heraus (ein Akzentrahmen, kein Blinken). */
    highlight: z.boolean().optional(),
    /** LINK/PRODUCT: kleines Vorschaubild links im Knopf. */
    thumbnailUrl: z.string().max(2000).optional(),
    /** LINK: kurzes Etikett rechts („neu“, „ausverkauft“). */
    badge: z.string().max(24).optional(),

    /** LINK: zweite Adresse für einen A/B-Test. */
    variantHref: z.string().max(2000).optional(),

    /** EMBED/MUSIC: die Quelle, aus der lib/embed.ts den Player baut. */
    embedUrl: z.string().max(2000).optional(),

    /** IMAGE: Alternativtext. Pflicht, sobald ein Bild gesetzt ist. */
    alt: z.string().max(300).optional(),

    /** NEWSLETTER/CONTACT: Beschriftung und Bestätigung. */
    buttonLabel: z.string().max(40).optional(),
    successMessage: z.string().max(200).optional(),
    /** CONTACT: Nachrichtenfeld anzeigen. */
    withMessage: z.boolean().optional(),

    /** TIP: Vorschlagsbeträge in Cent. */
    amounts: z.array(z.number().int().min(100).max(100_000)).max(4).optional(),
    /** PRODUCT: Preis in Cent + Währung. */
    priceCents: z.number().int().min(0).max(10_000_000).optional(),
    currency: z.string().length(3).optional(),

    /** COMMUNITY_CTA: Beschriftung des Knopfs. */
    ctaLabel: z.string().max(40).optional(),
  })
  .strip();

export type BlockConfig = z.infer<typeof blockConfigSchema>;

export function parseBlockConfig(raw: unknown): BlockConfig {
  const result = blockConfigSchema.safeParse(raw ?? {});
  return result.success ? result.data : {};
}

// ---------------------------------------------------------------------------
// Sichtbarkeit
// ---------------------------------------------------------------------------

export interface ScheduledBlock {
  isVisible: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

/**
 * Zeigt sich dieser Block gerade?
 *
 * Bewusst hier und nicht als `where`-Klausel: das Studio muss geplante Blöcke
 * SEHEN (mit Hinweis „ab Freitag“), die öffentliche Seite darf sie nicht
 * ausliefern. Eine Funktion, zwei Aufrufer, keine zwei Wahrheiten.
 */
export function isBlockLive(block: ScheduledBlock, now = new Date()): boolean {
  if (!block.isVisible) return false;
  if (block.startsAt && block.startsAt > now) return false;
  if (block.endsAt && block.endsAt <= now) return false;
  return true;
}

/** Warum ein Block gerade nicht sichtbar ist — für die Anzeige im Studio. */
export function blockVisibilityReason(
  block: ScheduledBlock,
  now = new Date(),
): "hidden" | "scheduled" | "expired" | null {
  if (!block.isVisible) return "hidden";
  if (block.startsAt && block.startsAt > now) return "scheduled";
  if (block.endsAt && block.endsAt <= now) return "expired";
  return null;
}
