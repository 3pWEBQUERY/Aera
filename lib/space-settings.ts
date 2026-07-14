// ---------------------------------------------------------------- Announcements
/**
 * Community-wide announcement banners, stored in the settings JSON of the
 * space they are managed from. Rendered at the very top of all /c/[slug]
 * pages while published and not expired.
 */
export interface SpaceAnnouncement {
  id: string;
  /** Bold lead text, e.g. "Upgrade now to prevent losing access on July 09." */
  title: string;
  /** Secondary text after the title (optional). */
  message: string;
  bgColor: string; // #RRGGBB
  textColor: string; // #RRGGBB
  bgImageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  /** ISO timestamp — banner hides itself afterwards. */
  endsAt: string | null;
  /** Live countdown ("7d : 9h : 12m") towards endsAt. */
  showTimer: boolean;
  isPublished: boolean;
  createdAt: string;
}

export const ANNOUNCEMENT_DEFAULTS = {
  bgColor: "#fffbeb",
  textColor: "#0f172a",
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function safeAnnouncementColor(v: unknown, fallback: string): string {
  return typeof v === "string" && HEX_COLOR.test(v) ? v : fallback;
}

function safeUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  return s.startsWith("/") && !s.startsWith("//")
    ? s
    : /^https?:\/\//i.test(s)
      ? s
      : null;
}

/** Coerce the `announcements` array inside a space settings JSON. */
export function parseAnnouncements(raw: unknown): SpaceAnnouncement[] {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const list = Array.isArray(obj.announcements) ? obj.announcements : [];
  const out: SpaceAnnouncement[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (typeof a.id !== "string" || typeof a.title !== "string" || !a.title.trim()) continue;
    const endsAtDate = typeof a.endsAt === "string" ? new Date(a.endsAt) : null;
    out.push({
      id: a.id,
      title: a.title,
      message: typeof a.message === "string" ? a.message : "",
      bgColor: safeAnnouncementColor(a.bgColor, ANNOUNCEMENT_DEFAULTS.bgColor),
      textColor: safeAnnouncementColor(a.textColor, ANNOUNCEMENT_DEFAULTS.textColor),
      bgImageUrl: safeUrl(a.bgImageUrl),
      ctaLabel:
        typeof a.ctaLabel === "string" && a.ctaLabel.trim() ? a.ctaLabel.trim() : null,
      ctaUrl: safeUrl(a.ctaUrl),
      endsAt:
        endsAtDate && !Number.isNaN(endsAtDate.getTime()) ? endsAtDate.toISOString() : null,
      showTimer: a.showTimer === true,
      isPublished: a.isPublished !== false,
      createdAt:
        typeof a.createdAt === "string" ? a.createdAt : new Date(0).toISOString(),
    });
  }
  return out;
}

/** Published announcements that have not expired yet. */
export function activeAnnouncements(raw: unknown, now = new Date()): SpaceAnnouncement[] {
  return parseAnnouncements(raw).filter(
    (a) => a.isPublished && (!a.endsAt || new Date(a.endsAt) > now),
  );
}

/**
 * "Announcements only": the space exists purely as a container for banner
 * announcements — it is hidden from the community navigation, its public
 * page 404s, and the dashboard shows only the banner manager.
 */
export function isAnnouncementsOnly(raw: unknown): boolean {
  return (
    !!raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).announcementsOnly === true
  );
}

// ---------------------------------------------------------------- Links
/** A curated link in a LINKS space ("Link-Hub"). */
export interface SpaceLink {
  id: string;
  title: string;
  url: string;
  description: string;
  createdAt: string; // ISO
}

export function parseSpaceLinks(raw: unknown): SpaceLink[] {
  const s =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  if (!Array.isArray(s.links)) return [];
  const out: SpaceLink[] = [];
  for (const item of s.links) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    if (typeof l.id !== "string" || typeof l.title !== "string" || typeof l.url !== "string")
      continue;
    if (!/^https?:\/\//i.test(l.url) && !l.url.startsWith("/")) continue;
    out.push({
      id: l.id,
      title: l.title.slice(0, 120),
      url: l.url.slice(0, 600),
      description: typeof l.description === "string" ? l.description.slice(0, 240) : "",
      createdAt:
        typeof l.createdAt === "string" ? l.createdAt : new Date(0).toISOString(),
    });
  }
  return out;
}

// ---------------------------------------------------------------- Ads
/** A creator-managed ad banner in an ADS space ("Werbung"). */
export interface SpaceAd {
  id: string;
  title: string;
  /** Uploaded banner media (image or video). */
  mediaUrl: string;
  mediaType: "IMAGE" | "VIDEO";
  /** Click target — optional (banner without link is allowed). */
  targetUrl: string | null;
  /** Seconds this ad stays visible in the rotation (3–60). */
  durationSec: number;
  /** Optional end of the campaign — after this the ad is hidden. */
  endsAt: string | null; // ISO
  isPublished: boolean;
  createdAt: string; // ISO
}

export const AD_DURATION = { min: 3, max: 60, default: 8 } as const;

export function parseSpaceAds(raw: unknown): SpaceAd[] {
  const s =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  if (!Array.isArray(s.ads)) return [];
  const out: SpaceAd[] = [];
  for (const item of s.ads) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (typeof a.id !== "string" || typeof a.mediaUrl !== "string" || !a.mediaUrl)
      continue;
    const duration = Number(a.durationSec);
    out.push({
      id: a.id,
      title: typeof a.title === "string" ? a.title.slice(0, 120) : "",
      mediaUrl: a.mediaUrl.slice(0, 600),
      mediaType: a.mediaType === "VIDEO" ? "VIDEO" : "IMAGE",
      targetUrl:
        typeof a.targetUrl === "string" && a.targetUrl ? a.targetUrl.slice(0, 600) : null,
      durationSec:
        Number.isFinite(duration) && duration >= AD_DURATION.min
          ? Math.min(AD_DURATION.max, Math.floor(duration))
          : AD_DURATION.default,
      endsAt: typeof a.endsAt === "string" ? a.endsAt : null,
      isPublished: a.isPublished !== false,
      createdAt:
        typeof a.createdAt === "string" ? a.createdAt : new Date(0).toISOString(),
    });
  }
  return out;
}

/** Published ads whose campaign has not ended. */
export function activeSpaceAds(raw: unknown, now = new Date()): SpaceAd[] {
  return parseSpaceAds(raw).filter(
    (a) => a.isPublished && (!a.endsAt || new Date(a.endsAt) > now),
  );
}

// ---------------------------------------------------------------- Chat
export type ChatPostPolicy = "ALL" | "STAFF";

export interface ChatSettings {
  /** Pinned topic / house rules shown at the top of the chat. */
  topic: string;
  /** Who may post: everyone with access, or team (moderators+) only. */
  postPolicy: ChatPostPolicy;
  /** Minimum seconds between two messages from the same member (0 = off). */
  slowModeSeconds: number;
  /** Hard cap on a single message's length. */
  maxMessageLength: number;
  /** How many recent messages to load when opening the chat. */
  historyLimit: number;
}

export const CHAT_DEFAULTS: ChatSettings = {
  topic: "",
  postPolicy: "ALL",
  slowModeSeconds: 0,
  maxMessageLength: 2000,
  historyLimit: 80,
};

export const CHAT_POLICY_LABELS: Record<ChatPostPolicy, string> = {
  ALL: "Alle mit Zugriff",
  STAFF: "Nur Team",
};

export function parseChatSettings(raw: unknown): ChatSettings {
  const s =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const postPolicy: ChatPostPolicy = s.postPolicy === "STAFF" ? "STAFF" : "ALL";
  const topic = typeof s.topic === "string" ? s.topic.slice(0, 280) : "";
  const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? Math.min(max, Math.floor(n)) : dflt;
  };
  return {
    topic,
    postPolicy,
    slowModeSeconds: clampInt(s.slowModeSeconds, 0, 3600, CHAT_DEFAULTS.slowModeSeconds),
    maxMessageLength: clampInt(s.maxMessageLength, 1, 10000, CHAT_DEFAULTS.maxMessageLength),
    historyLimit: clampInt(s.historyLimit, 20, 300, CHAT_DEFAULTS.historyLimit),
  };
}

// ---------------------------------------------------------------- Stories
export interface StorySettings {
  /** Default lifetime (hours) prefilled for new stories. 1–168. */
  defaultTtlHours: number;
  /** Auto-advance in the fullscreen viewer. 0 = manual, else 1–30 seconds. */
  autoplaySeconds: number;
}

export const STORY_DEFAULTS: StorySettings = {
  defaultTtlHours: 24,
  autoplaySeconds: 5,
};

export function parseStorySettings(raw: unknown): StorySettings {
  const s =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? Math.min(max, Math.floor(n)) : dflt;
  };
  const autoplay = Number(s.autoplaySeconds);
  return {
    defaultTtlHours: clampInt(s.defaultTtlHours, 1, 168, STORY_DEFAULTS.defaultTtlHours),
    autoplaySeconds:
      Number.isFinite(autoplay) && autoplay > 0 ? Math.min(30, Math.floor(autoplay)) : 0,
  };
}

export type KnowledgeSort = "NEWEST" | "OLDEST" | "AZ" | "ZA";
export type KnowledgeLayout = "LIST" | "GRID";

export interface KnowledgeSettings {
  sort: KnowledgeSort;
  pageSize: number; // 0 = alle auf einer Seite
  layout: KnowledgeLayout;
  showSearch: boolean;
  showIndex: boolean;
  showDates: boolean;
}

export const KNOWLEDGE_DEFAULTS: KnowledgeSettings = {
  sort: "NEWEST",
  pageSize: 10,
  layout: "LIST",
  showSearch: true,
  showIndex: true,
  showDates: true,
};

export const KNOWLEDGE_SORT_LABELS: Record<KnowledgeSort, string> = {
  NEWEST: "Neueste zuerst",
  OLDEST: "Älteste zuerst",
  AZ: "Titel A–Z",
  ZA: "Titel Z–A",
};

// ---------------------------------------------------------------- Blog
export type BlogLayout = "MAGAZINE" | "GRID" | "LIST";
export type BlogSort = "NEWEST" | "OLDEST" | "AZ" | "ZA";

export interface BlogSettings {
  layout: BlogLayout;
  featured: boolean; // large hero card for the newest post (MAGAZINE only)
  columns: number; // 2 or 3
  pageSize: number; // 0 = alle
  sort: BlogSort;
  showExcerpt: boolean;
  showAuthor: boolean;
  showDate: boolean;
  showReadTime: boolean;
  showCover: boolean;
}

export const BLOG_DEFAULTS: BlogSettings = {
  layout: "MAGAZINE",
  featured: true,
  columns: 3,
  pageSize: 9,
  sort: "NEWEST",
  showExcerpt: true,
  showAuthor: true,
  showDate: true,
  showReadTime: true,
  showCover: true,
};

export const BLOG_LAYOUT_LABELS: Record<BlogLayout, string> = {
  MAGAZINE: "Magazin (Hero + Raster)",
  GRID: "Raster (gleichmäßig)",
  LIST: "Liste (Zeilen)",
};
export const BLOG_SORT_LABELS: Record<BlogSort, string> = {
  NEWEST: "Neueste zuerst",
  OLDEST: "Älteste zuerst",
  AZ: "Titel A–Z",
  ZA: "Titel Z–A",
};

export function parseBlogSettings(raw: unknown): BlogSettings {
  const s =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const layout: BlogLayout = (["MAGAZINE", "GRID", "LIST"] as const).includes(s.layout as BlogLayout)
    ? (s.layout as BlogLayout)
    : BLOG_DEFAULTS.layout;
  const sort: BlogSort = (["NEWEST", "OLDEST", "AZ", "ZA"] as const).includes(s.sort as BlogSort)
    ? (s.sort as BlogSort)
    : BLOG_DEFAULTS.sort;
  const columns = Number(s.columns) === 2 ? 2 : 3;
  const pageSizeNum = Number(s.pageSize);
  const pageSize =
    Number.isFinite(pageSizeNum) && pageSizeNum >= 0 ? Math.min(60, Math.floor(pageSizeNum)) : BLOG_DEFAULTS.pageSize;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    layout,
    sort,
    columns,
    pageSize,
    featured: bool(s.featured, BLOG_DEFAULTS.featured),
    showExcerpt: bool(s.showExcerpt, BLOG_DEFAULTS.showExcerpt),
    showAuthor: bool(s.showAuthor, BLOG_DEFAULTS.showAuthor),
    showDate: bool(s.showDate, BLOG_DEFAULTS.showDate),
    showReadTime: bool(s.showReadTime, BLOG_DEFAULTS.showReadTime),
    showCover: bool(s.showCover, BLOG_DEFAULTS.showCover),
  };
}

/** Coerce arbitrary JSON from the DB into a valid, complete settings object. */
export function parseKnowledgeSettings(raw: unknown): KnowledgeSettings {
  const s =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const sort: KnowledgeSort = (["NEWEST", "OLDEST", "AZ", "ZA"] as const).includes(
    s.sort as KnowledgeSort,
  )
    ? (s.sort as KnowledgeSort)
    : KNOWLEDGE_DEFAULTS.sort;
  const layout: KnowledgeLayout = (["LIST", "GRID"] as const).includes(
    s.layout as KnowledgeLayout,
  )
    ? (s.layout as KnowledgeLayout)
    : KNOWLEDGE_DEFAULTS.layout;
  const pageSizeNum = Number(s.pageSize);
  const pageSize =
    Number.isFinite(pageSizeNum) && pageSizeNum >= 0
      ? Math.min(100, Math.floor(pageSizeNum))
      : KNOWLEDGE_DEFAULTS.pageSize;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    sort,
    layout,
    pageSize,
    showSearch: bool(s.showSearch, KNOWLEDGE_DEFAULTS.showSearch),
    showIndex: bool(s.showIndex, KNOWLEDGE_DEFAULTS.showIndex),
    showDates: bool(s.showDates, KNOWLEDGE_DEFAULTS.showDates),
  };
}
