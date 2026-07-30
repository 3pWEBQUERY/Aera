import type { IconName } from "@/components/dashboard/icons";
import type { FeatureKey, SpaceTypeKey } from "./plan-features";

/**
 * Die Navigation des Creator-Dashboards als Daten.
 *
 * Liegt hier und nicht in der Nav-Komponente, weil zwei Stellen dieselbe
 * Liste brauchen: die Seitenleiste zeichnet sie, und die Suche im Kopfbereich
 * durchsucht sie mit ("seo" tippen und direkt bei den SEO-Einstellungen
 * landen). Zwei Kopien waeren nach dem ersten neuen Menuepunkt auseinander.
 */
export interface DashboardNavItem {
  /** Relativ zu /dashboard/[slug]; "" ist die Uebersicht. */
  href: string;
  /** Leaf key within the `dashboard.nav` namespace. */
  labelKey: string;
  icon: IconName;
  /** Gated behind a package — the entry stays visible, but shows a lock. */
  feature?: FeatureKey;
  /**
   * Nur der Punkt selbst faerbt sich, nicht seine Unterseiten. Fuer /spaces:
   * die einzelnen Spaces stehen weiter unten mit eigenen Eintraegen in der
   * Sidebar — ohne das leuchteten auf einer Space-Seite zwei Punkte auf.
   */
  exact?: boolean;
}

export interface DashboardNavGroup {
  labelKey: string;
  items: DashboardNavItem[];
}

/** Gruppen oberhalb der dynamischen Space-Liste. */
export const NAV_GROUPS_BEFORE: DashboardNavGroup[] = [
  {
    labelKey: "manage",
    items: [
      { href: "", labelKey: "overview", icon: "dashboard" },
      { href: "/spaces", labelKey: "spaces", icon: "spaces", exact: true },
      { href: "/media", labelKey: "media", icon: "gallery" },
      { href: "/planner", labelKey: "planner", icon: "events", feature: "planner" },
      { href: "/members", labelKey: "members", icon: "members" },
      { href: "/moderation", labelKey: "moderation", icon: "alert" },
    ],
  },
  {
    labelKey: "monetization",
    items: [
      { href: "/tiers", labelKey: "tiers", icon: "tiers" },
      { href: "/products", labelKey: "products", icon: "products", feature: "products" },
      { href: "/payouts", labelKey: "payouts", icon: "payouts", feature: "payouts" },
    ],
  },
];

/** Gruppen unterhalb der dynamischen Space-Liste. */
export const NAV_GROUPS_AFTER: DashboardNavGroup[] = [
  {
    labelKey: "growth",
    items: [
      { href: "/analytics", labelKey: "analytics", icon: "trendingUp", feature: "analytics" },
      { href: "/gamification", labelKey: "gamification", icon: "gamification", feature: "gamification" },
      { href: "/referrals", labelKey: "referrals", icon: "megaphone", feature: "referrals" },
      { href: "/automations", labelKey: "automations", icon: "clock", feature: "automations" },
    ],
  },
  {
    labelKey: "settingsGroup",
    items: [
      { href: "/layout", labelKey: "layout", icon: "layout" },
      { href: "/menu", labelKey: "menu", icon: "menu" },
      { href: "/settings", labelKey: "settings", icon: "settings" },
      { href: "/seo", labelKey: "seo", icon: "search" },
      { href: "/developers", labelKey: "developers", icon: "bolt", feature: "developers" },
      { href: "/export", labelKey: "export", icon: "export", feature: "export" },
    ],
  },
];

/**
 * Alle anspringbaren Bereiche in einer Liste. Bewusst genau die, die auch in
 * der Seitenleiste stehen — die Suche soll nirgendwo hinfuehren, wohin man
 * nicht auch klicken kann.
 */
export const ALL_NAV_ITEMS: DashboardNavItem[] = [
  ...NAV_GROUPS_BEFORE.flatMap((g) => g.items),
  ...NAV_GROUPS_AFTER.flatMap((g) => g.items),
  { href: "/assistant", labelKey: "aiAssistant", icon: "sparkles" },
];

/** Space-Typ → Icon. Einzige Quelle für Sidebar, Picker, Layout-Editor und Suche. */
export const SPACE_TYPE_ICON: Record<SpaceTypeKey, IconName> = {
  FEED: "feed",
  FORUM: "forum",
  COURSE: "courses",
  SHOP: "products",
  NEWSLETTER: "newsletter",
  EVENTS: "events",
  BLOG: "blog",
  KNOWLEDGE: "knowledge",
  GALLERY: "gallery",
  VIDEOS: "videos",
  CHAT: "chat",
  PODCAST: "podcast",
  MUSIC: "music",
  LINKS: "link",
  ADS: "megaphone",
  LIVE: "videos",
  REQUESTS: "messages",
  BOOKING: "clock",
  STORIES: "sparkles",
  TIPS: "heart",
  CALENDAR: "events",
};

/** Icon eines Space-Typs, mit Rueckfall fuer unbekannte Werte aus der DB. */
export function spaceTypeIcon(type: string): IconName {
  return SPACE_TYPE_ICON[type as SpaceTypeKey] ?? "spaces";
}
