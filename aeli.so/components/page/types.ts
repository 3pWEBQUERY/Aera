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
  theme: ResolvedTheme;
  blocks: PageBlock[];
  showBranding: boolean;
  gate: AeliGate;
  community: {
    name: string;
    url: string;
    logoUrl: string | null;
    tagline: string | null;
  } | null;
  isLive: boolean;
  /** Absolute Adresse — für QR-Code und Teilen. */
  publicUrl: string;
}

/**
 * `live` = echte Seite: Klicks werden gezählt, Formulare senden wirklich.
 * `preview` = Studio: alles sichtbar, nichts passiert.
 */
export type PageMode = "live" | "preview";
