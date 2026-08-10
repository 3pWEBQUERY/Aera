import type { AeliBlockType, AeliGate } from "@/app/generated/prisma/client";
import type { BlockConfig } from "@/lib/blocks";
import type { SocialLink } from "@/lib/socials";
import type { ResolvedTheme } from "@/lib/themes";

/**
 * Die Bio-Seite wird an zwei Orten gerendert: als echte Seite auf
 * `{handle}.aeli.so` (Server) und als Vorschau im Studio (Client, mit noch
 * nicht gespeicherten Änderungen).
 *
 * Damit dafür EIN Satz Komponenten reicht, hängen sie nicht an Prisma-Modellen,
 * sondern an dieser Form: flach, serialisierbar, ohne `Date` und ohne
 * Beziehungen. Zwei Renderer für dieselbe Seite wären die sicherste Art,
 * Vorschau und Wirklichkeit auseinanderlaufen zu lassen.
 */

/**
 * Inhalte, die aus der verknüpften Aera-Community kommen.
 *
 * Sie stehen hier und nicht in `lib/aera-content.ts`, obwohl sie dort gefüllt
 * werden: dieses Modul beschreibt, was die Seite zum Rendern braucht, und wird
 * auch im Client geladen. `lib/aera-content.ts` ist `server-only` — die Form
 * muss also von hier kommen, nicht von dort.
 *
 * Alles ist bereits fertig aufbereitet: Termine als formatierter Text (die
 * Begründung steht bei `formatEventDate`), Ziele als absolute Adressen.
 */
export interface AeraEvent {
  id: string;
  title: string;
  /** Zerlegt, weil die Darstellung daraus eine Abrisskante baut: „14 / Sep“. */
  dayLabel: string;
  monthLabel: string;
  timeLabel: string;
  /** Vollständig, für Vorlesen und den Tooltip: „Do, 14. Sep 2026, 19:00“. */
  dateLabel: string;
  /** Maschinenlesbar für `<time datetime>`. */
  startsAt: string;
  location: string | null;
  isOnline: boolean;
  url: string;
}

export interface AeraTier {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: "FREE" | "MONTH" | "YEAR" | "ONE_TIME";
  isRecommended: boolean;
  url: string;
}

export interface AeraProduct {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  coverUrl: string | null;
  url: string;
}

export interface AeraCourse {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  url: string;
}

export interface AeraSpace {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  url: string;
}

export interface AeraContent {
  events: AeraEvent[];
  tiers: AeraTier[];
  products: AeraProduct[];
  courses: AeraCourse[];
  spaces: AeraSpace[];
}

/** Keine Community verknüpft, oder kein AERA_*-Baustein auf der Seite. */
export const EMPTY_AERA_CONTENT: AeraContent = {
  events: [],
  tiers: [],
  products: [],
  courses: [],
  spaces: [],
};

/**
 * Eine Karte im Stapel.
 *
 * `theme` ist hier bereits aufgelöst — entweder das eigene der Karte oder das
 * der Seite. Die Komponenten fragen nie „hat diese Karte ein eigenes Design?",
 * sie bekommen das fertige. Wer das wissen muss, ist allein das Studio, und
 * dafür steht `ownTheme` daneben.
 */
export interface PageCard {
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  theme: ResolvedTheme;
  /** Nur fürs Studio: erbt die Karte das Design der Seite? */
  ownTheme: boolean;
  blocks: PageBlock[];
}

export interface PageBlock {
  id: string;
  type: AeliBlockType;
  title: string | null;
  subtitle: string | null;
  href: string | null;
  mediaUrl: string | null;
  icon: string | null;
  config: BlockConfig;
}

export interface PageData {
  profileId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  socials: SocialLink[];
  /**
   * Das Design der Seite. Es ist die Voreinstellung, nicht das, was gerendert
   * wird — gerendert wird immer `card.theme`. Für den Schirm vor der Seite
   * (Passwort, Alter) gibt es keine Karte, deshalb steht es hier.
   */
  theme: ResolvedTheme;
  /** Der Stapel. Mindestens eine Karte, sonst gäbe es keine Seite. */
  cards: PageCard[];
  /** Welche Karte beim Öffnen im Bild steht — aus der Adresse. */
  activeCardIndex: number;
  showBranding: boolean;
  gate: AeliGate;
  community: {
    name: string;
    url: string;
    logoUrl: string | null;
    tagline: string | null;
  } | null;
  isLive: boolean;
  /**
   * Kann diese Seite Geld annehmen? Hängt an einem verbundenen Stripe-Konto —
   * entweder dem eigenen oder dem der eigenen Aera-Community (lib/payouts.ts).
   * Ohne das ist der Trinkgeld-Baustein nur ein Link.
   */
  tipsEnabled: boolean;
  /** Was die verknüpfte Community gerade zeigt. Leer, wenn keine da ist. */
  aera: AeraContent;
  /** Absolute Adresse — für QR-Code und Teilen. */
  publicUrl: string;
}

/**
 * `live` = echte Seite: Klicks werden gezählt, Formulare senden wirklich.
 * `preview` = Studio: alles sichtbar, nichts passiert.
 */
export type PageMode = "live" | "preview";
