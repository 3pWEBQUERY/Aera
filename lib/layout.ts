import type { IconName } from "@/components/dashboard/icons";
import { safeLinkHref } from "./utils";

/**
 * Community page-builder config, stored on `Tenant.layout` (JSON).
 *
 * - `sections`: ordered content blocks of the community home page, each with a
 *   visibility flag. Drives what `/c/[slug]` renders and in what order.
 * - `nav`: custom sidebar navigation items. When empty, the platform default
 *   (auto-generated from spaces) is used.
 * - `header`: hero display options (photo vs cover) and social links.
 */

export type SectionType =
  | "RECENT_POSTS"
  | "POPULAR_POSTS"
  | "SHOP"
  | "VIDEOS"
  | "IMAGES"
  | "PODCAST"
  | "ADS"
  | "SPACES"
  | "RECOMMENDATIONS"
  | "LEADERBOARD"
  | "LIVE"
  // A single, user-picked space featured as its own section. Unlike the fixed
  // catalog types above, several SPACE sections can coexist (one per space),
  // so they carry a `value` (space slug) and a stable `id`.
  | "SPACE";

/** Fixed catalog section types (everything except the per-space SPACE type). */
export type CatalogSectionType = Exclude<SectionType, "SPACE">;

export interface LayoutSection {
  type: SectionType;
  enabled: boolean;
  /** Stable identity for SPACE sections (multiple may exist). */
  id?: string;
  /** Space slug for SPACE sections. */
  value?: string;
}

export type NavType =
  | "HOME"
  | "SPACE"
  | "MEMBERS"
  | "LIBRARY"
  | "LIVE"
  | "JOIN"
  | "EXTERNAL"
  | "RECENTLY_VISITED";

export interface NavItemConfig {
  id: string;
  label: string;
  type: NavType;
  /** Space slug (SPACE) or absolute URL (EXTERNAL). */
  value?: string;
}

// ------------------------------------------------------- Menü der Kopfzeile
/**
 * Die Zeile unter der Beschreibung auf der Community-Startseite.
 *
 * Sie stand bisher fest: eine Beitritts-Pille, optional "Unterstuetzen" und
 * ein "…"-Knopf mit vier immer gleichen Einträgen. Jetzt stellt der Creator
 * sie zusammen — aus Spaces, eingebauten Seiten, eigenen Adressen und den
 * beiden Aktionen (Teilen, Beitreten).
 *
 * Zwei Dinge machen daraus mehr als eine Linkliste:
 *
 * `slot` entscheidet, ob ein Punkt in der Zeile steht oder im "…"-Menü. Damit
 * ist der Drei-Punkte-Knopf nichts Festes mehr, sondern der Ort für alles,
 * was zwar erreichbar sein soll, aber nicht die Zeile belegen darf.
 *
 * `audience` blendet einen Punkt für die aus, für die er nicht gilt: "Deine
 * Mitgliedschaft" hat für einen Gast keinen Sinn, "Kostenlos beitreten" für
 * ein Mitglied keinen. Genau das tat die alte, fest verdrahtete Liste — nur
 * konnte man es nicht ändern.
 */
export type HeroMenuType =
  | "SPACE"
  | "HOME"
  | "MEMBERS"
  | "LEADERBOARD"
  | "LIBRARY"
  | "LIVE"
  | "SEARCH"
  | "JOIN"
  | "TIPS"
  | "DASHBOARD"
  | "SHARE"
  | "LINK";

export type HeroMenuSlot = "BAR" | "MORE";

/** Für wen ein Punkt sichtbar ist. */
export type HeroMenuAudience = "ALL" | "GUESTS" | "MEMBERS" | "STAFF";

/** Wie ein Punkt in der Zeile aussieht. Im "…"-Menü spielt es keine Rolle. */
export type HeroMenuStyle = "SOLID" | "OUTLINE" | "PLAIN";

export interface HeroMenuItem {
  id: string;
  label: string;
  type: HeroMenuType;
  /** Space-Slug (SPACE) bzw. Adresse (LINK). */
  value?: string;
  icon?: IconName;
  slot: HeroMenuSlot;
  audience: HeroMenuAudience;
  style: HeroMenuStyle;
}

export interface HeroMenuConfig {
  items: HeroMenuItem[];
  /** Der "…"-Knopf: abschaltbar, beschriftbar. */
  more: { enabled: boolean; label: string };
}

/** So viele Punkte trägt die Zeile, bevor sie unruhig wird. */
export const HERO_MENU_MAX = 24;

export const HERO_MENU_TYPES: HeroMenuType[] = [
  "SPACE",
  "HOME",
  "MEMBERS",
  "LEADERBOARD",
  "LIBRARY",
  "LIVE",
  "SEARCH",
  "JOIN",
  "TIPS",
  "DASHBOARD",
  "SHARE",
  "LINK",
];

export const HERO_MENU_ICON: Record<HeroMenuType, IconName> = {
  SPACE: "spaces",
  HOME: "home",
  MEMBERS: "members",
  LEADERBOARD: "trophy",
  LIBRARY: "gallery",
  LIVE: "broadcast",
  SEARCH: "search",
  JOIN: "tiers",
  TIPS: "heart",
  DASHBOARD: "dashboard",
  SHARE: "share",
  LINK: "external",
};

/** Punkte, die von sich aus nur für ein Publikum sinnvoll sind. */
export const HERO_MENU_DEFAULT_AUDIENCE: Partial<Record<HeroMenuType, HeroMenuAudience>> = {
  JOIN: "GUESTS",
  LIBRARY: "MEMBERS",
  DASHBOARD: "STAFF",
};

/**
 * Die Belegung, die eine Community ohne eigene Einstellung sieht — genau das,
 * was die Kopfzeile vorher fest anzeigte. Wer nichts ändert, merkt nichts.
 */
export function defaultHeroMenu(): HeroMenuConfig {
  const item = (
    id: string,
    type: HeroMenuType,
    slot: HeroMenuSlot,
    audience: HeroMenuAudience = "ALL",
    style: HeroMenuStyle = "PLAIN",
  ): HeroMenuItem => ({ id, label: "", type, slot, audience, style, icon: undefined });
  return {
    items: [
      item("d-join", "JOIN", "BAR", "GUESTS", "SOLID"),
      item("d-tips", "TIPS", "BAR", "ALL", "OUTLINE"),
      item("d-library", "LIBRARY", "MORE", "MEMBERS"),
      item("d-member", "JOIN", "MORE", "MEMBERS"),
      item("d-members", "MEMBERS", "MORE"),
      item("d-board", "LEADERBOARD", "MORE"),
      item("d-dash", "DASHBOARD", "MORE", "STAFF"),
      item("d-share", "SHARE", "MORE"),
    ],
    more: { enabled: true, label: "" },
  };
}

/** Adresse eines Menüpunkts. Aktionen (SHARE) haben keine. */
export function heroMenuHref(item: HeroMenuItem, slug: string): string | null {
  switch (item.type) {
    case "SPACE":
      return item.value ? `/c/${slug}/s/${item.value}` : null;
    case "HOME":
      return `/c/${slug}`;
    case "MEMBERS":
      return `/c/${slug}/members`;
    case "LEADERBOARD":
      return `/c/${slug}/leaderboard`;
    case "LIBRARY":
      return `/c/${slug}/library`;
    case "LIVE":
      return `/c/${slug}/live`;
    case "SEARCH":
      return `/c/${slug}/search`;
    case "JOIN":
      return `/c/${slug}/join`;
    case "TIPS":
      // Der Trinkgeld-Space heisst je Community anders; die Adresse kommt
      // deshalb von aussen und steht in `value`.
      return item.value ?? null;
    case "DASHBOARD":
      return `/dashboard/${slug}`;
    case "LINK":
      return item.value ?? null;
    case "SHARE":
      return null;
  }
}

/** Gilt der Punkt für diesen Betrachter? */
export function heroMenuVisible(
  item: HeroMenuItem,
  viewer: { isMember: boolean; isStaff: boolean },
): boolean {
  switch (item.audience) {
    case "GUESTS":
      return !viewer.isMember;
    case "MEMBERS":
      return viewer.isMember;
    case "STAFF":
      return viewer.isStaff;
    case "ALL":
      return true;
  }
}

/* ------------------------------------------------------------------ Banner */

/**
 * Einblendungen auf der Community-Seite: die angeheftete Leiste unten, eine
 * Leiste oben, ein Fenster in der Mitte, eine kleine Karte in der Ecke.
 *
 * Sie stehen in der Layout-Konfiguration und nicht in einer eigenen Tabelle,
 * weil sie Einstellung sind und kein Inhalt — ein paar Zeilen Text, ein Ziel,
 * ein Zeitpunkt. Das hat einen konkreten Vorteil: die Live-Vorschau des
 * Editors reicht die Konfiguration ohnehin schon an den Server weiter, der
 * Creator sieht seinen Banner also beim Bauen.
 */
export type BannerPlacement = "BOTTOM" | "TOP" | "CENTER" | "CORNER";
/**
 * Ziel des Knopfes.
 *
 * Dieselbe Idee wie bei der Menuezeile der Kopfzeile: die Seiten der Plattform
 * stehen als feste Punkte zur Wahl, weil ihre Adressen aus dem Community-Slug
 * folgen und niemand sie abtippen sollte. `LINK` bleibt fuer alles daneben,
 * `NONE` fuer einen Banner, der nur etwas mitteilt.
 */
export type BannerTarget =
  | "NONE"
  | "JOIN"
  | "HOME"
  | "MEMBERS"
  | "LEADERBOARD"
  | "LIBRARY"
  | "LIVE"
  | "SEARCH"
  | "TIPS"
  | "SPACE"
  | "PAGE"
  | "LINK";
/** Wodurch die Einblendung ausgeloest wird. */
export type BannerTrigger = "IMMEDIATE" | "DELAY" | "SCROLL" | "EXIT";
/** Wie oft ein Besucher sie zu sehen bekommt. */
export type BannerFrequency = "ALWAYS" | "SESSION" | "DISMISSED";
export type BannerTone = "BRAND" | "DARK" | "LIGHT";

export interface BannerConfig {
  id: string;
  enabled: boolean;
  placement: BannerPlacement;
  tone: BannerTone;
  audience: HeroMenuAudience;
  title: string;
  text: string;
  /** Beschriftung des Knopfes. Leer heisst: kein Knopf, nur Text. */
  label: string;
  /**
   * Wohin der Knopf fuehrt. Feste Ziele werden aus dem Adressteil der
   * Community abgeleitet — der Creator soll `/c/seine-community/join` nicht
   * abtippen und sich dabei vertippen muessen.
   */
  targetType: BannerTarget;
  /** Space- bzw. Seitenadresse bei SPACE und PAGE. Sonst leer. */
  targetValue: string;
  /** Frei gesetzte Adresse. Nur bei LINK gefuellt. */
  href: string;
  /** Zweite, leise Beschriftung ("Später"). Leer heisst: nur das Kreuz. */
  secondaryLabel: string;
  /** Ohne Schliessen-Kreuz bleibt die Einblendung stehen. */
  dismissible: boolean;
  trigger: BannerTrigger;
  /** Sekunden bei DELAY, Prozent der Seitenhoehe bei SCROLL. */
  triggerValue: number;
  frequency: BannerFrequency;
  /** Tag im Format JJJJ-MM-TT, oder leer fuer "ab sofort" / "ohne Ende". */
  startAt: string;
  endAt: string;
}

/** Mehr Einblendungen als das kann keine Seite vertragen. */
export const BANNER_MAX = 6;

export const BANNER_PLACEMENTS: BannerPlacement[] = ["BOTTOM", "TOP", "CENTER", "CORNER"];
export const BANNER_TARGETS: BannerTarget[] = [
  "JOIN",
  "TIPS",
  "PAGE",
  "SPACE",
  "HOME",
  "MEMBERS",
  "LEADERBOARD",
  "LIBRARY",
  "LIVE",
  "SEARCH",
  "LINK",
  "NONE",
];

export const BANNER_TARGET_ICON: Record<BannerTarget, IconName> = {
  NONE: "eraser",
  JOIN: "tiers",
  HOME: "home",
  MEMBERS: "members",
  LEADERBOARD: "trophy",
  LIBRARY: "gallery",
  LIVE: "broadcast",
  SEARCH: "search",
  TIPS: "heart",
  SPACE: "spaces",
  PAGE: "knowledge",
  LINK: "external",
};

/**
 * Die endgueltige Adresse des Knopfes.
 *
 * `tipsHref` kommt von aussen, weil der Trinkgeld-Space in jeder Community
 * anders heisst — dieselbe Ausnahme wie bei der Menuezeile der Kopfzeile.
 * `null` heisst: kein Knopf. Ein Ziel, das ins Leere zeigt (Space geloescht,
 * Seite umbenannt), wird so zu einem Banner ohne Knopf statt zu einem Knopf,
 * der auf eine Fehlerseite fuehrt.
 */
export function bannerHref(
  banner: BannerConfig,
  slug: string,
  tipsHref: string | null,
): string | null {
  switch (banner.targetType) {
    case "NONE":
      return null;
    case "LINK":
      return banner.href || null;
    case "SPACE":
      return banner.targetValue ? `/c/${slug}/s/${banner.targetValue}` : null;
    case "PAGE":
      return banner.targetValue ? `/c/${slug}/p/${banner.targetValue}` : null;
    case "TIPS":
      return tipsHref;
    case "HOME":
      return `/c/${slug}`;
    case "JOIN":
      return `/c/${slug}/join`;
    case "MEMBERS":
      return `/c/${slug}/members`;
    case "LEADERBOARD":
      return `/c/${slug}/leaderboard`;
    case "LIBRARY":
      return `/c/${slug}/library`;
    case "LIVE":
      return `/c/${slug}/live`;
    case "SEARCH":
      return `/c/${slug}/search`;
  }
}
export const BANNER_TRIGGERS: BannerTrigger[] = ["IMMEDIATE", "DELAY", "SCROLL", "EXIT"];
export const BANNER_FREQUENCIES: BannerFrequency[] = ["ALWAYS", "SESSION", "DISMISSED"];
export const BANNER_TONES: BannerTone[] = ["BRAND", "DARK", "LIGHT"];

/** Standardwerte eines frisch angelegten Banners. */
export function emptyBanner(id: string): BannerConfig {
  return {
    id,
    enabled: true,
    placement: "BOTTOM",
    tone: "DARK",
    audience: "GUESTS",
    title: "",
    text: "",
    label: "",
    // Der haeufigste Banner wirbt um Mitglieder — und die Zielgruppe steht
    // oben schon auf "Gäste". Ein anderes Standardziel waere Widerspruch.
    targetType: "JOIN",
    targetValue: "",
    href: "",
    secondaryLabel: "",
    dismissible: true,
    trigger: "DELAY",
    triggerValue: 8,
    frequency: "DISMISSED",
    startAt: "",
    endAt: "",
  };
}

/**
 * Liest die Bannerliste zurueck.
 *
 * `triggerValue` wird je nach Ausloeser in verschiedene Grenzen gezwungen:
 * 300 Sekunden Wartezeit sind lang, aber denkbar; 300 Prozent Scrolltiefe
 * gibt es nicht.
 */
export function parseBanners(raw: unknown): BannerConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: BannerConfig[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (out.length >= BANNER_MAX) break;
    const r = asRecord(entry);
    let id = typeof r.id === "string" ? r.id.slice(0, 40) : "";
    if (!id || seen.has(id)) id = `b-${out.length}`;
    seen.add(id);

    const trigger: BannerTrigger = BANNER_TRIGGERS.includes(r.trigger as BannerTrigger)
      ? (r.trigger as BannerTrigger)
      : "DELAY";
    const rawValue = typeof r.triggerValue === "number" ? Math.round(r.triggerValue) : 8;
    const triggerValue =
      trigger === "SCROLL"
        ? Math.min(100, Math.max(1, rawValue))
        : Math.min(300, Math.max(0, rawValue));

    out.push({
      id,
      enabled: r.enabled !== false,
      placement: BANNER_PLACEMENTS.includes(r.placement as BannerPlacement)
        ? (r.placement as BannerPlacement)
        : "BOTTOM",
      tone: BANNER_TONES.includes(r.tone as BannerTone) ? (r.tone as BannerTone) : "DARK",
      audience:
        r.audience === "GUESTS" || r.audience === "MEMBERS" || r.audience === "STAFF"
          ? r.audience
          : "ALL",
      title: typeof r.title === "string" ? r.title.slice(0, 80) : "",
      text: typeof r.text === "string" ? r.text.slice(0, 240) : "",
      label: typeof r.label === "string" ? r.label.slice(0, 40) : "",
      ...parseBannerTarget(r),
      secondaryLabel: typeof r.secondaryLabel === "string" ? r.secondaryLabel.slice(0, 40) : "",
      dismissible: r.dismissible !== false,
      trigger,
      triggerValue,
      frequency: BANNER_FREQUENCIES.includes(r.frequency as BannerFrequency)
        ? (r.frequency as BannerFrequency)
        : "DISMISSED",
      startAt: isDay(r.startAt) ? r.startAt : "",
      endAt: isDay(r.endAt) ? r.endAt : "",
    });
  }
  return out;
}

/**
 * Ziel eines Banners einlesen.
 *
 * Banner aus der Zeit vor der Zielauswahl kennen nur `href`. Sie werden als
 * frei gesetzter Link gelesen — genau das waren sie —, statt still auf den
 * Standard zurueckzufallen und den Knopf woanders hinzuschicken.
 */
function parseBannerTarget(r: Record<string, unknown>): {
  targetType: BannerTarget;
  targetValue: string;
  href: string;
} {
  const href = safeLinkHref(r.href, 500);
  const stored = BANNER_TARGETS.includes(r.targetType as BannerTarget)
    ? (r.targetType as BannerTarget)
    : undefined;
  const targetType: BannerTarget = stored ?? (href ? "LINK" : "NONE");
  const targetValue =
    targetType === "SPACE" || targetType === "PAGE"
      ? typeof r.targetValue === "string"
        ? r.targetValue.trim().slice(0, 80)
        : ""
      : "";
  return { targetType, targetValue, href: targetType === "LINK" ? href : "" };
}

/** Tagesangabe im Format JJJJ-MM-TT? */
function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Faellt der Tag `today` (JJJJ-MM-TT) in den eingestellten Zeitraum?
 *
 * Bewusst auf Tagesebene und als Zeichenkettenvergleich: der Creator denkt in
 * Tagen, nicht in Zeitzonen. Ein Vergleich ueber `Date` haette hier nur die
 * Frage aufgeworfen, wessen Mitternacht gemeint ist.
 */
export function bannerInSchedule(banner: BannerConfig, today: string): boolean {
  if (banner.startAt && today < banner.startAt) return false;
  if (banner.endAt && today > banner.endAt) return false;
  return true;
}

/** Gilt die Einblendung fuer diesen Betrachter, heute, in diesem Zustand? */
export function bannerVisible(
  banner: BannerConfig,
  viewer: { isMember: boolean; isStaff: boolean },
  today: string,
): boolean {
  if (!banner.enabled) return false;
  if (!banner.title.trim() && !banner.text.trim()) return false;
  if (!bannerInSchedule(banner, today)) return false;
  switch (banner.audience) {
    case "GUESTS":
      return !viewer.isMember;
    case "MEMBERS":
      return viewer.isMember;
    case "STAFF":
      return viewer.isStaff;
    case "ALL":
      return true;
  }
}

export type HeaderMode = "PHOTO" | "COVER";

/**
 * Ausfuehrung der Kopfzeile auf der Community-Startseite. Fuenf fertige
 * Zustaende statt eines Baukastens — siehe components/community/community-hero.
 */
export type HeaderVariant =
  | "EDITORIAL"
  | "MOSAIC"
  | "SPOTLIGHT"
  | "IMMERSIVE"
  | "COMPACT";

export const HEADER_VARIANTS: HeaderVariant[] = [
  "EDITORIAL",
  "MOSAIC",
  "SPOTLIGHT",
  "IMMERSIVE",
  "COMPACT",
];

export interface SocialLink {
  platform: string;
  url: string;
}

/** So viele Bilder traegt der Mosaik-Kopfbereich (6 Spalten x 2 Reihen). */
export const MOSAIC_MAX = 12;

export interface LayoutHeader {
  mode: HeaderMode;
  variant: HeaderVariant;
  /**
   * Bilder des Mosaik-Kopfbereichs, vom Creator hochgeladen und in dieser
   * Reihenfolge gezeigt. Bewusst nicht automatisch aus Beitraegen befuellt:
   * welches Bild ueber der Seite steht, ist eine Gestaltungsentscheidung.
   */
  mosaic: string[];
  socials: SocialLink[];
}

/** Viewer segments — each gets its own section layout. */
export type Audience = "PUBLIC" | "FREE" | "PAID";

export const AUDIENCES: { key: Audience; label: string; short: string }[] = [
  { key: "PAID", label: "PAID", short: "PAID" },
  { key: "FREE", label: "FREE", short: "FREE" },
  { key: "PUBLIC", label: "PUBLIC", short: "PUBLIC" },
];

export type SectionsByAudience = Record<Audience, LayoutSection[]>;

export interface LayoutConfig {
  /** Section order/visibility per viewer segment. */
  sectionsByAudience: SectionsByAudience;
  nav: NavItemConfig[];
  header: LayoutHeader;
  /** Die Menüzeile der Kopfzeile — gilt für jeden Kopfzeilen-Stil. */
  heroMenu: HeroMenuConfig;
  /** Einblendungen auf der Community-Seite. */
  banners: BannerConfig[];
}

// ---------------------------------------------------------------- Catalogs
export const SECTION_CATALOG: {
  type: SectionType;
  label: string;
  group: string;
  icon: IconName;
  desc: string;
}[] = [
  { type: "RECENT_POSTS", label: "RECENT_POSTS", group: "posts", icon: "feed", desc: "RECENT_POSTS" },
  { type: "POPULAR_POSTS", label: "POPULAR_POSTS", group: "posts", icon: "heart", desc: "POPULAR_POSTS" },
  { type: "VIDEOS", label: "VIDEOS", group: "media", icon: "videos", desc: "VIDEOS" },
  { type: "IMAGES", label: "IMAGES", group: "media", icon: "gallery", desc: "IMAGES" },
  { type: "PODCAST", label: "PODCAST", group: "media", icon: "podcast", desc: "PODCAST" },
  { type: "ADS", label: "ADS", group: "ads", icon: "megaphone", desc: "ADS" },
  { type: "SHOP", label: "SHOP", group: "shop", icon: "products", desc: "SHOP" },
  { type: "SPACES", label: "SPACES", group: "community", icon: "spaces", desc: "SPACES" },
  { type: "RECOMMENDATIONS", label: "RECOMMENDATIONS", group: "community", icon: "sparkles", desc: "RECOMMENDATIONS" },
  { type: "LEADERBOARD", label: "LEADERBOARD", group: "community", icon: "trophy", desc: "LEADERBOARD" },
  // Live steht bewusst im Bereich "community": ein laufender Stream ist ein
  // Termin, kein Medienarchiv.
  { type: "LIVE", label: "LIVE", group: "community", icon: "broadcast", desc: "LIVE" },
];

export const SECTION_META: Record<CatalogSectionType, { label: string; icon: IconName; group: string }> =
  Object.fromEntries(SECTION_CATALOG.map((s) => [s.type, { label: s.label, icon: s.icon, group: s.group }])) as Record<
    CatalogSectionType,
    { label: string; icon: IconName; group: string }
  >;

const SECTION_TYPES = SECTION_CATALOG.map((s) => s.type);

export const NAV_TYPE_LABELS: Record<NavType, string> = {
  HOME: "HOME",
  SPACE: "SPACE",
  MEMBERS: "MEMBERS",
  LIBRARY: "LIBRARY",
  LIVE: "LIVE",
  JOIN: "JOIN",
  EXTERNAL: "EXTERNAL",
  RECENTLY_VISITED: "RECENTLY_VISITED",
};

export const NAV_TYPE_ICON: Record<NavType, IconName> = {
  HOME: "home",
  SPACE: "spaces",
  MEMBERS: "members",
  LIBRARY: "gallery",
  LIVE: "broadcast",
  JOIN: "tiers",
  EXTERNAL: "external",
  RECENTLY_VISITED: "clock",
};

/** Nav types that render a dynamic, built-in view rather than a fixed link. */
export function isDynamicNav(item: NavItemConfig): boolean {
  return item.type === "RECENTLY_VISITED";
}

// ---------------------------------------------------------------- Defaults
export function defaultSections(): LayoutSection[] {
  return SECTION_TYPES.map((type) => ({ type, enabled: true }));
}

export function defaultHeader(): LayoutHeader {
  // EDITORIAL ist der Aufbau, den jede bestehende Community heute hat —
  // ein neuer Standard wuerde tausende Seiten ungefragt umbauen.
  return { mode: "COVER", variant: "EDITORIAL", mosaic: [], socials: [] };
}

export function defaultSectionsByAudience(): SectionsByAudience {
  return { PUBLIC: defaultSections(), FREE: defaultSections(), PAID: defaultSections() };
}

export function defaultLayout(): LayoutConfig {
  return {
    sectionsByAudience: defaultSectionsByAudience(),
    nav: [],
    header: defaultHeader(),
    heroMenu: defaultHeroMenu(),
    // Keine Einblendung ist der richtige Ausgangszustand: eine Community, die
    // nichts eingestellt hat, soll niemandem etwas vor die Seite schieben.
    banners: [],
  };
}

// ---------------------------------------------------------------- Parsing
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// Keep stored order/visibility, append catalog sections added since (disabled
// when a layout was already configured), and drop unknown types.
function parseSectionsList(raw: unknown): LayoutSection[] {
  const stored = Array.isArray(raw) ? raw : [];
  const seen = new Set<SectionType>();
  const seenSpace = new Set<string>();
  const out: LayoutSection[] = [];
  for (const s of stored) {
    const r = asRecord(s);
    const type = r.type as SectionType;
    if (type === "SPACE") {
      // Per-space section: keep every distinct space, dedupe by slug.
      const value = typeof r.value === "string" ? r.value.trim().slice(0, 120) : "";
      if (!value || seenSpace.has(value)) continue;
      seenSpace.add(value);
      out.push({
        type: "SPACE",
        value,
        id: typeof r.id === "string" ? r.id : Math.random().toString(36).slice(2, 10),
        enabled: r.enabled !== false,
      });
      continue;
    }
    if (!SECTION_TYPES.includes(type) || seen.has(type)) continue;
    seen.add(type);
    out.push({ type, enabled: r.enabled !== false });
  }
  // Append catalog sections introduced since this layout was saved (disabled
  // when a layout already existed, enabled on a fresh default).
  for (const type of SECTION_TYPES) {
    if (!seen.has(type)) out.push({ type, enabled: stored.length === 0 });
  }
  return out;
}

export function parseLayout(raw: unknown): LayoutConfig {
  const obj = asRecord(raw);

  // Sections per audience — supports the new shape, the legacy single-list
  // shape (applied to all audiences), and empty (defaults).
  let sectionsByAudience: SectionsByAudience;
  if (obj.sectionsByAudience && typeof obj.sectionsByAudience === "object") {
    const sba = asRecord(obj.sectionsByAudience);
    sectionsByAudience = {
      PUBLIC: parseSectionsList(sba.PUBLIC),
      FREE: parseSectionsList(sba.FREE),
      PAID: parseSectionsList(sba.PAID),
    };
  } else if (Array.isArray(obj.sections)) {
    const single = parseSectionsList(obj.sections);
    const clone = () => single.map((s) => ({ ...s }));
    sectionsByAudience = { PUBLIC: clone(), FREE: clone(), PAID: clone() };
  } else {
    sectionsByAudience = defaultSectionsByAudience();
  }

  // Nav
  const storedNav = Array.isArray(obj.nav) ? obj.nav : [];
  const nav: NavItemConfig[] = [];
  for (const n of storedNav) {
    const r = asRecord(n);
    const type = r.type as NavType;
    if (!(type in NAV_TYPE_LABELS)) continue;
    const label = typeof r.label === "string" ? r.label.slice(0, 40) : NAV_TYPE_LABELS[type];
    const value = typeof r.value === "string" ? r.value.slice(0, 300) : undefined;
    nav.push({
      id: typeof r.id === "string" ? r.id : Math.random().toString(36).slice(2, 10),
      label: label || NAV_TYPE_LABELS[type],
      type,
      value,
    });
  }

  // Header
  const h = asRecord(obj.header);
  const mode: HeaderMode = h.mode === "PHOTO" ? "PHOTO" : "COVER";
  const variant: HeaderVariant = HEADER_VARIANTS.includes(h.variant as HeaderVariant)
    ? (h.variant as HeaderVariant)
    : "EDITORIAL";
  const mosaic: string[] = Array.isArray(h.mosaic)
    ? h.mosaic
        .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
        .map((u) => u.trim().slice(0, 500))
        .slice(0, MOSAIC_MAX)
    : [];
  const socials: SocialLink[] = Array.isArray(h.socials)
    ? h.socials
        .map((s) => asRecord(s))
        .filter((s) => typeof s.url === "string" && (s.url as string).trim())
        .map((s) => ({
          platform: typeof s.platform === "string" ? s.platform.slice(0, 30) : "link",
          url: (s.url as string).slice(0, 300),
        }))
        .slice(0, 8)
    : [];

  return {
    sectionsByAudience,
    nav,
    header: { mode, variant, mosaic, socials },
    heroMenu: parseHeroMenu(obj.heroMenu),
    banners: parseBanners(obj.banners),
  };
}

/**
 * Menüzeile einlesen.
 *
 * Fehlt der Abschnitt ganz, gilt die Standardbelegung — eine Community, die
 * nichts eingestellt hat, soll aussehen wie vorher. Eine ausdrücklich leere
 * Liste bleibt dagegen leer: "ich will hier nichts" ist eine Einstellung.
 */
export function parseHeroMenu(raw: unknown): HeroMenuConfig {
  if (raw === undefined || raw === null) return defaultHeroMenu();
  const obj = asRecord(raw);
  if (!Array.isArray(obj.items)) return defaultHeroMenu();

  const items: HeroMenuItem[] = [];
  const seen = new Set<string>();
  for (const entry of obj.items) {
    if (items.length >= HERO_MENU_MAX) break;
    const r = asRecord(entry);
    const type = r.type as HeroMenuType;
    if (!HERO_MENU_TYPES.includes(type)) continue;
    // Bei LINK ist `value` eine frei gesetzte Adresse und geht deshalb durch
    // dieselbe Schema-Pruefung wie jeder andere Creator-Link: ohne sie landete
    // ein `javascript:`-Ziel ungefiltert im href der Kopfzeile.
    const rawValue = typeof r.value === "string" ? r.value.trim().slice(0, 300) : undefined;
    const value = type === "LINK" ? safeLinkHref(rawValue, 300) || undefined : rawValue;
    // Ein Punkt ohne Ziel führt ins Leere und wird stillschweigend verworfen.
    if ((type === "SPACE" || type === "LINK") && !value) continue;
    let id = typeof r.id === "string" ? r.id.slice(0, 40) : "";
    if (!id || seen.has(id)) id = `m-${items.length}-${type.toLowerCase()}`;
    seen.add(id);
    items.push({
      id,
      label: typeof r.label === "string" ? r.label.slice(0, 40) : "",
      type,
      value,
      icon: typeof r.icon === "string" ? (r.icon as IconName) : undefined,
      slot: r.slot === "MORE" ? "MORE" : "BAR",
      audience:
        r.audience === "GUESTS" || r.audience === "MEMBERS" || r.audience === "STAFF"
          ? r.audience
          : (HERO_MENU_DEFAULT_AUDIENCE[type] ?? "ALL"),
      style: r.style === "SOLID" || r.style === "OUTLINE" ? r.style : "PLAIN",
    });
  }

  const more = asRecord(obj.more);
  return {
    items,
    more: {
      enabled: more.enabled !== false,
      label: typeof more.label === "string" ? more.label.slice(0, 40) : "",
    },
  };
}

/** Enabled section types in configured order for a viewer segment. */
export function orderedSectionTypes(cfg: LayoutConfig, audience: Audience): SectionType[] {
  return cfg.sectionsByAudience[audience].filter((s) => s.enabled).map((s) => s.type);
}

/** Enabled sections (full objects, incl. SPACE value) in configured order. */
export function orderedSections(cfg: LayoutConfig, audience: Audience): LayoutSection[] {
  return cfg.sectionsByAudience[audience].filter((s) => s.enabled);
}

/** Map a viewer's access to the audience whose layout they should see. */
export function audienceFor(isMember: boolean, hasPaid: boolean): Audience {
  if (hasPaid) return "PAID";
  if (isMember) return "FREE";
  return "PUBLIC";
}

/** Resolve a custom nav item to a concrete href within the community. */
export function resolveNavHref(item: NavItemConfig, slug: string): string {
  switch (item.type) {
    case "HOME":
      return `/c/${slug}`;
    case "MEMBERS":
      return `/c/${slug}/members`;
    case "LIBRARY":
      return `/c/${slug}/library`;
    case "LIVE":
      return `/c/${slug}/live`;
    case "JOIN":
      return `/c/${slug}/join`;
    case "SPACE":
      return item.value ? `/c/${slug}/s/${item.value}` : `/c/${slug}`;
    case "EXTERNAL":
      return item.value ?? "#";
    case "RECENTLY_VISITED":
      // Rendered as a dynamic sidebar section, not a navigable page.
      return "#";
  }
}

export function isExternalNav(item: NavItemConfig): boolean {
  return item.type === "EXTERNAL";
}
