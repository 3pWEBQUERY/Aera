// ---------------------------------------------------------------------------
// Plan feature matrix — the single source of truth for what a creator package
// unlocks. Pure data (no "server-only", no Prisma), so the same matrix drives
// the marketing pricing page, the dashboard navigation, the space picker and
// the server-side enforcement in actions/routes.
//
// Rule of thumb: FREE is a real, useful product (the eleven basic spaces), but
// everything that makes a creator *grow* or *earn* lives one tier up.
// ---------------------------------------------------------------------------
import { PLAN_ORDER, PLANS, type PlanKey } from "./credit-plans";

export type { PlanKey };

/** Numeric rank so plans can be compared (`FREE` = 0 … `SCALE` = 3). */
export const PLAN_RANK: Record<PlanKey, number> = PLAN_ORDER.reduce(
  (acc, key, index) => {
    acc[key] = index;
    return acc;
  },
  {} as Record<PlanKey, number>,
);

/** True when `plan` is at least as high as `required`. */
export function planAtLeast(plan: PlanKey, required: PlanKey): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

/** The next higher package, or null when already on the top tier. */
export function nextPlanAfter(plan: PlanKey): PlanKey | null {
  return PLAN_ORDER[PLAN_RANK[plan] + 1] ?? null;
}

export function planName(plan: PlanKey): string {
  return PLANS[plan].name;
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

/** Every space type the product knows (mirrors the Prisma `SpaceType` enum). */
export type SpaceTypeKey =
  | "FEED"
  | "FORUM"
  | "COURSE"
  | "SHOP"
  | "NEWSLETTER"
  | "EVENTS"
  | "BLOG"
  | "KNOWLEDGE"
  | "GALLERY"
  | "VIDEOS"
  | "CHAT"
  | "PODCAST"
  | "LINKS"
  | "ADS"
  | "LIVE"
  | "REQUESTS"
  | "BOOKING"
  | "STORIES"
  | "TIPS"
  | "CALENDAR";

/**
 * Minimum package required per space type.
 *
 * FREE  — the eleven basics every community needs to get started.
 * STARTER — selling & talking: shop, chat, tips, calendar.
 * PRO   — the production-grade formats: podcast, live, booking, requests.
 * SCALE — monetising the surface itself: own ad campaigns.
 */
export const SPACE_TYPE_MIN_PLAN: Record<SpaceTypeKey, PlanKey> = {
  // ---- Free -------------------------------------------------------------
  FEED: "FREE",
  FORUM: "FREE",
  COURSE: "FREE",
  NEWSLETTER: "FREE",
  EVENTS: "FREE",
  BLOG: "FREE",
  KNOWLEDGE: "FREE",
  GALLERY: "FREE",
  VIDEOS: "FREE",
  LINKS: "FREE",
  STORIES: "FREE",
  // ---- Starter ----------------------------------------------------------
  SHOP: "STARTER",
  CHAT: "STARTER",
  TIPS: "STARTER",
  CALENDAR: "STARTER",
  // ---- Pro --------------------------------------------------------------
  PODCAST: "PRO",
  LIVE: "PRO",
  BOOKING: "PRO",
  REQUESTS: "PRO",
  // ---- Scale ------------------------------------------------------------
  ADS: "SCALE",
};

export const SPACE_TYPE_KEYS = Object.keys(SPACE_TYPE_MIN_PLAN) as SpaceTypeKey[];

export function minPlanForSpaceType(type: string): PlanKey {
  return SPACE_TYPE_MIN_PLAN[type as SpaceTypeKey] ?? "SCALE";
}

/** Server-authoritative check used before a space row is ever written. */
export function planAllowsSpaceType(plan: PlanKey, type: string): boolean {
  return planAtLeast(plan, minPlanForSpaceType(type));
}

/** All space types a package may create (in catalogue order). */
export function spaceTypesForPlan(plan: PlanKey): SpaceTypeKey[] {
  return SPACE_TYPE_KEYS.filter((type) => planAllowsSpaceType(plan, type));
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/**
 * Gated capabilities. Anything NOT listed here is available on every package —
 * that keeps the free tier honest and the gate list auditable.
 */
export type FeatureKey =
  | "analytics"
  | "products"
  | "payouts"
  | "planner"
  | "gamification"
  | "referrals"
  | "automations"
  | "export"
  | "mediaStudio"
  | "customDomain"
  | "developers"
  | "webhooks";

export interface FeatureInfo {
  key: FeatureKey;
  minPlan: PlanKey;
  /** Icon from components/dashboard/icons. */
  icon: string;
}

export const FEATURES: Record<FeatureKey, FeatureInfo> = {
  // ---- Starter ----------------------------------------------------------
  analytics: { key: "analytics", minPlan: "STARTER", icon: "trendingUp" },
  products: { key: "products", minPlan: "STARTER", icon: "products" },
  payouts: { key: "payouts", minPlan: "STARTER", icon: "payouts" },
  planner: { key: "planner", minPlan: "STARTER", icon: "events" },
  // ---- Pro --------------------------------------------------------------
  gamification: { key: "gamification", minPlan: "PRO", icon: "gamification" },
  referrals: { key: "referrals", minPlan: "PRO", icon: "megaphone" },
  automations: { key: "automations", minPlan: "PRO", icon: "clock" },
  export: { key: "export", minPlan: "PRO", icon: "export" },
  mediaStudio: { key: "mediaStudio", minPlan: "PRO", icon: "sparkles" },
  customDomain: { key: "customDomain", minPlan: "PRO", icon: "globe" },
  // ---- Scale ------------------------------------------------------------
  developers: { key: "developers", minPlan: "SCALE", icon: "bolt" },
  webhooks: { key: "webhooks", minPlan: "SCALE", icon: "bolt" },
};

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function minPlanForFeature(feature: FeatureKey): PlanKey {
  return FEATURES[feature].minPlan;
}

/** Server-authoritative feature check. */
export function planAllowsFeature(plan: PlanKey, feature: FeatureKey): boolean {
  return planAtLeast(plan, FEATURES[feature].minPlan);
}

export function featuresForPlan(plan: PlanKey): FeatureKey[] {
  return FEATURE_KEYS.filter((key) => planAllowsFeature(plan, key));
}

/** Features unlocked exactly by stepping up to `plan` (used on pricing cards). */
export function featuresIntroducedBy(plan: PlanKey): FeatureKey[] {
  return FEATURE_KEYS.filter((key) => FEATURES[key].minPlan === plan);
}

export function spaceTypesIntroducedBy(plan: PlanKey): SpaceTypeKey[] {
  return SPACE_TYPE_KEYS.filter((type) => SPACE_TYPE_MIN_PLAN[type] === plan);
}

// ---------------------------------------------------------------------------
// Hard limits
// ---------------------------------------------------------------------------

export interface PlanLimits {
  /** Max. non-archived spaces. `null` = unlimited. */
  maxSpaces: number | null;
  /** Max. active members. `null` = unlimited. */
  maxMembers: number | null;
  /** Max. staff seats (ADMIN/MODERATOR besides the owner). `null` = unlimited. */
  maxStaff: number | null;
  /** Max. membership tiers a creator may sell. `null` = unlimited. */
  maxTiers: number | null;
  /** Included media storage in GB (mirrors the credit catalogue). */
  storageGb: number;
}

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  FREE: { maxSpaces: 5, maxMembers: 100, maxStaff: 1, maxTiers: 2, storageGb: PLANS.FREE.storageGb },
  STARTER: { maxSpaces: 15, maxMembers: 1000, maxStaff: 3, maxTiers: 5, storageGb: PLANS.STARTER.storageGb },
  PRO: { maxSpaces: 40, maxMembers: 10000, maxStaff: 10, maxTiers: 15, storageGb: PLANS.PRO.storageGb },
  SCALE: { maxSpaces: null, maxMembers: null, maxStaff: null, maxTiers: null, storageGb: PLANS.SCALE.storageGb },
};

export function limitsForPlan(plan: PlanKey): PlanLimits {
  return PLAN_LIMITS[plan];
}

/** `true` when a limit still has room (or is unlimited). */
export function withinLimit(current: number, limit: number | null): boolean {
  return limit === null || current < limit;
}

/** Lowest package whose limit covers `count` — used for "upgrade to …" hints. */
export function minPlanForLimit(
  count: number,
  pick: (limits: PlanLimits) => number | null,
): PlanKey {
  return (
    PLAN_ORDER.find((key) => withinLimit(count, pick(PLAN_LIMITS[key]))) ?? "SCALE"
  );
}

// ---------------------------------------------------------------------------
// Aggregate view — handy for passing one object into client components.
// ---------------------------------------------------------------------------
export interface PlanCapabilities {
  plan: PlanKey;
  planName: string;
  nextPlan: PlanKey | null;
  limits: PlanLimits;
  features: FeatureKey[];
  spaceTypes: SpaceTypeKey[];
}

export function capabilitiesFor(plan: PlanKey): PlanCapabilities {
  return {
    plan,
    planName: planName(plan),
    nextPlan: nextPlanAfter(plan),
    limits: limitsForPlan(plan),
    features: featuresForPlan(plan),
    spaceTypes: spaceTypesForPlan(plan),
  };
}
