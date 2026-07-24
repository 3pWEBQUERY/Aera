import { describe, it, expect, vi } from "vitest";

// promo-codes pulls in Prisma; the pure helpers under test never touch it.
vi.mock("@/lib/prisma", () => ({ default: {}, systemPrisma: {} }));

import {
  FEATURE_KEYS,
  PLAN_LIMITS,
  PLAN_RANK,
  SPACE_TYPE_KEYS,
  featuresForPlan,
  minPlanForFeature,
  minPlanForSpaceType,
  nextPlanAfter,
  planAllowsFeature,
  planAllowsSpaceType,
  planAtLeast,
  spaceTypesForPlan,
  withinLimit,
  type PlanKey,
} from "@/lib/plan-features";
import {
  normalizePromoCode,
  isValidPromoCode,
  generatePromoCode,
  promoCodeStatus,
} from "@/lib/promo-codes";
import { PLAN_ORDER } from "@/lib/credit-plans";

const PLANS: PlanKey[] = [...PLAN_ORDER];

describe("plan matrix", () => {
  it("ranks packages in catalogue order", () => {
    expect(PLAN_RANK.FREE).toBe(0);
    expect(PLAN_RANK.SCALE).toBe(PLANS.length - 1);
    expect(planAtLeast("PRO", "STARTER")).toBe(true);
    expect(planAtLeast("STARTER", "PRO")).toBe(false);
    expect(nextPlanAfter("SCALE")).toBeNull();
    expect(nextPlanAfter("FREE")).toBe("STARTER");
  });

  it("is monotonic: a higher package never loses a space type or feature", () => {
    for (let i = 1; i < PLANS.length; i++) {
      const lower = spaceTypesForPlan(PLANS[i - 1]);
      const higher = spaceTypesForPlan(PLANS[i]);
      for (const type of lower) expect(higher).toContain(type);

      const lowerFeatures = featuresForPlan(PLANS[i - 1]);
      const higherFeatures = featuresForPlan(PLANS[i]);
      for (const feature of lowerFeatures) expect(higherFeatures).toContain(feature);
    }
  });

  it("gives SCALE everything and FREE exactly the eleven basic spaces", () => {
    expect(spaceTypesForPlan("SCALE")).toHaveLength(SPACE_TYPE_KEYS.length);
    expect(featuresForPlan("SCALE")).toHaveLength(FEATURE_KEYS.length);
    expect(spaceTypesForPlan("FREE").sort()).toEqual(
      [
        "BLOG", "COURSE", "EVENTS", "FEED", "FORUM", "GALLERY",
        "KNOWLEDGE", "LINKS", "NEWSLETTER", "STORIES", "VIDEOS",
      ].sort(),
    );
    expect(featuresForPlan("FREE")).toEqual([]);
  });

  it("locks the paid space types and growth features on FREE", () => {
    for (const type of ["SHOP", "CHAT", "PODCAST", "LIVE", "BOOKING", "ADS"]) {
      expect(planAllowsSpaceType("FREE", type)).toBe(false);
    }
    expect(planAllowsFeature("FREE", "analytics")).toBe(false);
    expect(planAllowsFeature("STARTER", "analytics")).toBe(true);
    expect(planAllowsFeature("STARTER", "gamification")).toBe(false);
    expect(planAllowsFeature("PRO", "gamification")).toBe(true);
    expect(planAllowsFeature("PRO", "developers")).toBe(false);
    expect(planAllowsFeature("SCALE", "developers")).toBe(true);
  });

  it("treats an unknown space type as the most restrictive package", () => {
    expect(minPlanForSpaceType("NOT_A_TYPE")).toBe("SCALE");
    expect(planAllowsSpaceType("PRO", "NOT_A_TYPE")).toBe(false);
    expect(minPlanForFeature("analytics")).toBe("STARTER");
  });

  it("grows every limit with the package and makes SCALE unlimited", () => {
    for (let i = 1; i < PLANS.length; i++) {
      const lower = PLAN_LIMITS[PLANS[i - 1]];
      const higher = PLAN_LIMITS[PLANS[i]];
      for (const key of ["maxSpaces", "maxMembers", "maxStaff", "maxTiers"] as const) {
        const a = lower[key];
        const b = higher[key];
        if (a === null) expect(b).toBeNull();
        else if (b !== null) expect(b).toBeGreaterThan(a);
      }
      expect(higher.storageGb).toBeGreaterThan(lower.storageGb);
    }
    expect(PLAN_LIMITS.SCALE.maxSpaces).toBeNull();
    expect(withinLimit(999, null)).toBe(true);
    expect(withinLimit(5, 5)).toBe(false);
    expect(withinLimit(4, 5)).toBe(true);
  });
});

describe("promo codes", () => {
  it("normalises what a creator actually types", () => {
    expect(normalizePromoCode("  aera pro 7k2q  ")).toBe("AERA-PRO-7K2Q");
    expect(normalizePromoCode("--lisa__x--")).toBe("LISA-X");
    expect(normalizePromoCode(null)).toBe("");
    expect(normalizePromoCode("a".repeat(60))).toHaveLength(32);
  });

  it("accepts generated codes and rejects junk", () => {
    for (let i = 0; i < 25; i++) {
      const code = generatePromoCode("LISA");
      expect(isValidPromoCode(code)).toBe(true);
      expect(code.startsWith("LISA-")).toBe(true);
      // Ambiguous glyphs must never appear in the random part.
      expect(code.slice(5)).not.toMatch(/[OI01]/);
    }
    expect(isValidPromoCode("AB")).toBe(false);
    expect(isValidPromoCode("-ABC")).toBe(false);
  });

  it("derives the lifecycle status", () => {
    const now = new Date("2026-07-24T12:00:00Z");
    const base = {
      isActive: true,
      expiresAt: null as Date | null,
      redemptionCount: 0,
      maxRedemptions: 3,
    };
    expect(promoCodeStatus(base, now)).toBe("ACTIVE");
    expect(promoCodeStatus({ ...base, isActive: false }, now)).toBe("PAUSED");
    expect(
      promoCodeStatus({ ...base, expiresAt: new Date("2026-07-01T00:00:00Z") }, now),
    ).toBe("EXPIRED");
    expect(promoCodeStatus({ ...base, redemptionCount: 3 }, now)).toBe("USED_UP");
    // A paused code that is also used up reports the admin's own action first.
    expect(
      promoCodeStatus({ ...base, isActive: false, redemptionCount: 3 }, now),
    ).toBe("PAUSED");
  });
});
