import type { IconName } from "@/components/dashboard/icons";

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

export type HeaderMode = "PHOTO" | "COVER";

export interface SocialLink {
  platform: string;
  url: string;
}

export interface LayoutHeader {
  mode: HeaderMode;
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
  JOIN: "JOIN",
  EXTERNAL: "EXTERNAL",
  RECENTLY_VISITED: "RECENTLY_VISITED",
};

export const NAV_TYPE_ICON: Record<NavType, IconName> = {
  HOME: "home",
  SPACE: "spaces",
  MEMBERS: "members",
  LIBRARY: "gallery",
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
  return { mode: "COVER", socials: [] };
}

export function defaultSectionsByAudience(): SectionsByAudience {
  return { PUBLIC: defaultSections(), FREE: defaultSections(), PAID: defaultSections() };
}

export function defaultLayout(): LayoutConfig {
  return { sectionsByAudience: defaultSectionsByAudience(), nav: [], header: defaultHeader() };
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

  return { sectionsByAudience, nav, header: { mode, socials } };
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
