import type { IconName } from "@/components/dashboard/icons";

export type SpaceCatalogType =
  | "FEED"
  | "FORUM"
  | "BLOG"
  | "GALLERY"
  | "VIDEOS"
  | "COURSE"
  | "EVENTS"
  | "SHOP"
  | "NEWSLETTER"
  | "KNOWLEDGE"
  | "PODCAST"
  | "LINKS"
  | "ADS";

export interface SpaceBlueprint {
  type: SpaceCatalogType;
  name: string;
  slug: string;
  description: string;
  visibility: "PUBLIC" | "MEMBERS" | "PAID";
  icon: IconName;
  tagline: string;
}

/** Catalogue of spaces a creator can pre-provision during onboarding. */
export const SPACE_BLUEPRINTS: SpaceBlueprint[] = [
  { type: "FEED", name: "Ankündigungen", slug: "ankuendigungen", description: "Neuigkeiten und Updates aus der Community.", visibility: "PUBLIC", icon: "feed", tagline: "Neuigkeiten & Updates" },
  { type: "FORUM", name: "Community", slug: "community", description: "Stelle Fragen, teile Ideen und vernetze dich.", visibility: "MEMBERS", icon: "forum", tagline: "Diskussionen im Reddit-Stil" },
  { type: "BLOG", name: "Blog", slug: "blog", description: "Artikel und Geschichten für deine Community.", visibility: "PUBLIC", icon: "blog", tagline: "Artikel & Magazin" },
  { type: "GALLERY", name: "Galerie", slug: "galerie", description: "Bild- & Video-Pakete, frei oder zum Verkauf.", visibility: "MEMBERS", icon: "gallery", tagline: "Medien-Ordner & Verkauf" },
  { type: "VIDEOS", name: "Videos", slug: "videos", description: "Video-Beiträge für deine Mitglieder.", visibility: "MEMBERS", icon: "videos", tagline: "Video-Feed" },
  { type: "COURSE", name: "Kurse", slug: "kurse", description: "Strukturierte Kurse mit Lektionen.", visibility: "MEMBERS", icon: "courses", tagline: "Online- & Vor-Ort-Kurse" },
  { type: "EVENTS", name: "Events", slug: "events", description: "Termine, Anmeldungen und Zusagen.", visibility: "MEMBERS", icon: "events", tagline: "Termine & Zusagen" },
  { type: "SHOP", name: "Shop", slug: "shop", description: "Digitale und physische Produkte verkaufen.", visibility: "PUBLIC", icon: "products", tagline: "Produkte & Verkauf" },
  { type: "NEWSLETTER", name: "Newsletter", slug: "newsletter", description: "E-Mail-Kampagnen an deine Mitglieder.", visibility: "MEMBERS", icon: "newsletter", tagline: "E-Mail-Kampagnen" },
  { type: "KNOWLEDGE", name: "Wissensdatenbank", slug: "wissensdatenbank", description: "Hilfe-Artikel und Dokumentation.", visibility: "MEMBERS", icon: "knowledge", tagline: "Hilfe & Doku" },
  { type: "PODCAST", name: "Podcast", slug: "podcast", description: "Audio-Episoden zum Anhören — frei oder exklusiv.", visibility: "MEMBERS", icon: "podcast", tagline: "Episoden & Player" },
  { type: "LINKS", name: "Links", slug: "links", description: "Kuratierte Links zu allem, was zu dir gehört.", visibility: "PUBLIC", icon: "link", tagline: "Link-Hub" },
  { type: "ADS", name: "Werbung", slug: "werbung", description: "Eigene Werbebanner für die Startseite.", visibility: "PUBLIC", icon: "megaphone", tagline: "Banner & Kampagnen" },
];

export const DEFAULT_SPACE_TYPES: SpaceCatalogType[] = ["FEED", "FORUM"];

const BY_TYPE = new Map(SPACE_BLUEPRINTS.map((b) => [b.type, b]));

export function blueprintFor(type: string): SpaceBlueprint | undefined {
  return BY_TYPE.get(type as SpaceCatalogType);
}
