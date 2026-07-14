import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTenantAdmin: vi.fn(),
  getCreditSummary: vi.fn(),
  getOrCreateWallet: vi.fn(),
  updateCreatorSubscription: vi.fn(),
  createCreditPackCheckout: vi.fn(),
  createCreatorPlanCheckout: vi.fn(),
  cancelSubscriptionAtPeriodEnd: vi.fn(),
  features: { creatorBilling: false },
}));

vi.mock("@/lib/guards", () => ({
  requireTenantAdmin: mocks.requireTenantAdmin,
}));

vi.mock("@/lib/credits", () => ({
  getCreditSummary: mocks.getCreditSummary,
  getOrCreateWallet: mocks.getOrCreateWallet,
  updateCreatorSubscription: mocks.updateCreatorSubscription,
  CREDIT_PACKS: [{ id: "pack_5k", credits: 5000, priceCents: 2000 }],
  PLANS: {
    FREE: { key: "FREE", name: "Free", monthlyCredits: 500, priceCents: 0 },
    PRO: { key: "PRO", name: "Pro", monthlyCredits: 12000, priceCents: 4900 },
    SCALE: { key: "SCALE", name: "Scale", monthlyCredits: 50000, priceCents: 14900 },
  },
}));

vi.mock("@/lib/stripe", () => ({
  createCreditPackCheckout: mocks.createCreditPackCheckout,
  createCreatorPlanCheckout: mocks.createCreatorPlanCheckout,
  cancelSubscriptionAtPeriodEnd: mocks.cancelSubscriptionAtPeriodEnd,
}));

vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://aera.test" },
  features: mocks.features,
}));

import { GET, POST } from "@/app/api/dashboard/assistant/credits/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTenantAdmin.mockResolvedValue({
    tenant: { id: "t1", slug: "demo", name: "Demo" },
    user: { id: "u1", email: "owner@example.com" },
  });
  mocks.getCreditSummary.mockResolvedValue({ plan: "FREE", balance: 500 });
  mocks.getOrCreateWallet.mockResolvedValue({
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });
  mocks.createCreditPackCheckout.mockResolvedValue("https://checkout.test/pack");
  mocks.createCreatorPlanCheckout.mockResolvedValue("https://checkout.test/plan");
  mocks.cancelSubscriptionAtPeriodEnd.mockResolvedValue(new Date("2026-08-10T00:00:00Z"));
  mocks.features.creatorBilling = false;
});

describe("dashboard credit billing safety gate", () => {
  it("marks billing as unavailable in the credit summary", async () => {
    const res = await GET(new Request("http://localhost/api/dashboard/assistant/credits?slug=demo"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      summary: { plan: "FREE", balance: 500, billingEnabled: false },
    });
  });

  it("rejects credit-pack purchases without mutating the wallet", async () => {
    const res = await POST(
      new Request("http://localhost/api/dashboard/assistant/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "demo", action: "buy", packId: "pack_5k" }),
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(
      expect.objectContaining({ error: "billing_unavailable" }),
    );
    expect(mocks.getCreditSummary).not.toHaveBeenCalled();
  });

  it("rejects direct plan changes while billing is disabled", async () => {
    const res = await POST(
      new Request("http://localhost/api/dashboard/assistant/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "demo", action: "plan", plan: "SCALE" }),
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(
      expect.objectContaining({ error: "billing_unavailable" }),
    );
  });

  it("starts a Stripe checkout for a valid credit pack", async () => {
    mocks.features.creatorBilling = true;
    const res = await POST(
      new Request("http://localhost/api/dashboard/assistant/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "demo", action: "buy", packId: "pack_5k" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.test/pack" });
    expect(mocks.createCreditPackCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        pack: expect.objectContaining({ id: "pack_5k" }),
        user: { id: "u1", email: "owner@example.com" },
      }),
    );
  });

  it("starts a Stripe subscription checkout for a paid creator plan", async () => {
    mocks.features.creatorBilling = true;
    const res = await POST(
      new Request("http://localhost/api/dashboard/assistant/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "demo", action: "plan", plan: "PRO" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.test/plan" });
  });

  it("blocks a second paid subscription for the same tenant", async () => {
    mocks.features.creatorBilling = true;
    mocks.getOrCreateWallet.mockResolvedValue({
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_live",
    });
    const res = await POST(
      new Request("http://localhost/api/dashboard/assistant/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "demo", action: "plan", plan: "SCALE" }),
      }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(expect.objectContaining({ error: "existing_subscription" }));
    expect(mocks.createCreatorPlanCheckout).not.toHaveBeenCalled();
  });

  it("schedules creator-plan cancellation at the Stripe period end", async () => {
    mocks.features.creatorBilling = true;
    mocks.getOrCreateWallet.mockResolvedValue({
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_live",
      creatorSubscriptionStatus: "ACTIVE",
    });
    mocks.getCreditSummary.mockResolvedValue({ plan: "PRO", balance: 9000 });

    const res = await POST(
      new Request("http://localhost/api/dashboard/assistant/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "demo", action: "cancel_plan" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.cancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith("sub_live");
    expect(mocks.updateCreatorSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: "sub_live",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date("2026-08-10T00:00:00Z"),
      }),
    );
  });
});
