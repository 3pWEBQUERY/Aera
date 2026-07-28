import type { IconName } from "@/components/dashboard/icons";

/**
 * Auszeichnungen einer Community.
 *
 * Aussehen und Bedingung liegen zusammen im vorhandenen `Badge.criteria`
 * (JSON) — dadurch braucht das ganze System keine Schema-Aenderung, und alte
 * Auszeichnungen mit nur `{ type, threshold }` lesen sich weiter, sie bekommen
 * beim Einlesen einfach die Standardgestalt.
 *
 * Gezeichnet wird jede Auszeichnung aus Form + Metall + Zeichen (siehe
 * components/community/badge-medal). Kein Bildmaterial: das bleibt in jeder
 * Groesse scharf, faerbt sich mit der Markenfarbe und laesst sich vom Creator
 * zusammenstellen, ohne dass er eine Grafik bauen muss.
 */

export const BADGE_SHAPES = ["COIN", "MEDAL", "HEX", "SEAL"] as const;
export type BadgeShape = (typeof BADGE_SHAPES)[number];

export const BADGE_TIERS = ["GOLD", "SILVER", "BRONZE", "BRAND", "INK"] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];

/**
 * Woran eine Auszeichnung haengt. "manual" wird nur von Hand vergeben — das
 * ist die Ausnahme fuer alles, was sich nicht zaehlen laesst.
 */
export const BADGE_CRITERIA = [
  "points",
  "posts",
  "comments",
  "likesGiven",
  "likesReceived",
  "coursesCompleted",
  "lessonsCompleted",
  "memberDays",
  "manual",
] as const;
export type BadgeCriteriaType = (typeof BADGE_CRITERIA)[number];

/** Zeichen zur Auswahl — bewusst wenige, dafuer alle im selben Strich. */
export const BADGE_ICONS: IconName[] = [
  "trophy",
  "medal",
  "crown",
  "sparkles",
  "heart",
  "forum",
  "feed",
  "courses",
  "members",
  "bolt",
  "check",
  "music",
];

export interface BadgeLook {
  shape: BadgeShape;
  tier: BadgeTier;
  icon: IconName;
}

export interface BadgeCriteria extends BadgeLook {
  type: BadgeCriteriaType;
  threshold: number;
}

export const BADGE_DEFAULTS: BadgeCriteria = {
  type: "points",
  threshold: 100,
  shape: "COIN",
  tier: "GOLD",
  icon: "trophy",
};

function pick<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

/** Liest `Badge.criteria`, vervollstaendigt fehlende Felder. */
export function parseBadgeCriteria(raw: unknown): BadgeCriteria {
  const c =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const threshold = Number(c.threshold);
  return {
    type: pick(c.type, BADGE_CRITERIA, BADGE_DEFAULTS.type),
    threshold: Number.isFinite(threshold) && threshold > 0 ? Math.floor(threshold) : 0,
    shape: pick(c.shape, BADGE_SHAPES, BADGE_DEFAULTS.shape),
    tier: pick(c.tier, BADGE_TIERS, BADGE_DEFAULTS.tier),
    icon: pick(c.icon, BADGE_ICONS, BADGE_DEFAULTS.icon) as IconName,
  };
}

/** Metalltoene der Plaketten. `BRAND` uebernimmt die Farbe der Community. */
export const TIER_COLORS: Record<
  BadgeTier,
  { light: string; base: string; dark: string; rim: string; ink: string }
> = {
  GOLD: { light: "#FFE9A8", base: "#F5C13A", dark: "#C98A05", rim: "#FFF6D8", ink: "#6B4A00" },
  SILVER: { light: "#F2F5F8", base: "#C3CBD4", dark: "#8B96A3", rim: "#FFFFFF", ink: "#41505F" },
  BRONZE: { light: "#F6D3BC", base: "#D89A72", dark: "#A76846", rim: "#FBE7DA", ink: "#6B3B22" },
  BRAND: { light: "#FFFFFF", base: "var(--brand)", dark: "#1b1520", rim: "#FFFFFF", ink: "#FFFFFF" },
  INK: { light: "#5B5B57", base: "#2B2B28", dark: "#131311", rim: "#7A7A74", ink: "#FFFFFF" },
};
