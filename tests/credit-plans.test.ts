import { describe, it, expect } from "vitest";
import {
  creditsForTokens,
  TOKENS_PER_CREDIT,
  PLANS,
  PLAN_ORDER,
  CREDIT_PACKS,
  creatorPlanSignupHref,
  creatorPlanStartPath,
  parsePlanKey,
} from "@/lib/credit-plans";

describe("creditsForTokens", () => {
  it("charges a minimum of 1 credit", () => {
    expect(creditsForTokens(0)).toBe(1);
    expect(creditsForTokens(-50)).toBe(1);
    expect(creditsForTokens(1)).toBe(1);
  });

  it("rounds token usage up to whole credits", () => {
    expect(creditsForTokens(TOKENS_PER_CREDIT)).toBe(1);
    expect(creditsForTokens(TOKENS_PER_CREDIT + 1)).toBe(2);
    expect(creditsForTokens(12_345)).toBe(13);
  });
});

describe("plan catalog", () => {
  it("PLAN_ORDER covers exactly the defined plans", () => {
    expect([...PLAN_ORDER].sort()).toEqual(Object.keys(PLANS).sort());
  });

  it("plans are monotonically increasing in credits and price", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const prev = PLANS[PLAN_ORDER[i - 1]];
      const cur = PLANS[PLAN_ORDER[i]];
      expect(cur.monthlyCredits).toBeGreaterThan(prev.monthlyCredits);
      expect(cur.priceCents).toBeGreaterThan(prev.priceCents);
    }
  });

  it("credit packs have positive credits and prices", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.credits).toBeGreaterThan(0);
      expect(pack.priceCents).toBeGreaterThan(0);
    }
  });
});

describe("public creator-plan intent", () => {
  it("accepts only catalog plan keys", () => {
    expect(parsePlanKey("starter")).toBe("STARTER");
    expect(parsePlanKey(" PRO ")).toBe("PRO");
    expect(parsePlanKey("price_123")).toBeNull();
    expect(parsePlanKey("enterprise")).toBeNull();
    expect(parsePlanKey(null)).toBeNull();
  });

  it("carries the plan as an encoded same-site onboarding redirect", () => {
    expect(creatorPlanStartPath("SCALE")).toBe("/start?plan=SCALE");
    expect(creatorPlanSignupHref("SCALE")).toBe(
      "/signup?next=%2Fstart%3Fplan%3DSCALE",
    );
  });
});
