import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const stripeMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  retrieveSession: vi.fn(),
  expireSession: vi.fn(),
  cleanupOrphan: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    withTenantContext: (_tenantId: string, fn: () => unknown) => fn(),
  };
});

vi.mock("@/lib/stripe", () => ({
  createCreatorPlanCheckoutSession: stripeMocks.createSession,
  retrieveCreatorPlanCheckoutSession: stripeMocks.retrieveSession,
  expireCreatorPlanCheckoutSession: stripeMocks.expireSession,
  cancelAndRefundOrphanCreatorSubscription: stripeMocks.cleanupOrphan,
}));

import prismaModule from "@/lib/prisma";
import {
  countOpenCreatorCheckouts,
  startTrackedCreatorPlanCheckout,
} from "@/lib/creator-checkout";

const prisma = prismaModule as unknown as PrismaMock;
const args = {
  tenant: { id: "t1", name: "Demo", slug: "demo" },
  user: { id: "u1", email: "owner@example.com" },
  plan: {
    key: "PRO" as const,
    name: "Pro",
    monthlyCredits: 12_000,
    priceCents: 4_900,
    storageGb: 100,
    tagline: "Pro",
    features: [],
  },
  stripeCustomerId: null,
  successUrl: "https://aera.test/success",
  cancelUrl: "https://aera.test/cancel",
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.pendingCreatorCheckout.updateMany.mockResolvedValue({ count: 0 });
  prisma.pendingCreatorCheckout.findMany.mockResolvedValue([]);
  prisma.pendingCreatorCheckout.findFirst.mockResolvedValue(null);
  prisma.pendingCreatorCheckout.count.mockResolvedValue(0);
  stripeMocks.cleanupOrphan.mockResolvedValue({
    subscriptionCanceled: true,
    refundedCents: 4_900,
  });
});

describe("tracked creator plan Checkout", () => {
  it("persists the intent before Stripe and stores Session lifecycle data", async () => {
    const intentExpiresAt = new Date(Date.now() + 25 * 60 * 60_000);
    const stripeExpiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    prisma.pendingCreatorCheckout.create.mockResolvedValue({
      id: "pcc_1",
      tenantId: "t1",
      userId: "u1",
      plan: "PRO",
      status: "CREATING",
      stripeSessionId: null,
      stripeSubscriptionId: null,
      expiresAt: intentExpiresAt,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    stripeMocks.createSession.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.test/cs_1",
      status: "open",
      expiresAt: stripeExpiresAt,
      stripeSubscriptionId: null,
    });
    prisma.pendingCreatorCheckout.updateMany.mockResolvedValueOnce({ count: 1 });

    const url = await startTrackedCreatorPlanCheckout(args);

    expect(url).toBe("https://checkout.stripe.test/cs_1");
    expect(prisma.pendingCreatorCheckout.create.mock.invocationCallOrder[0]).toBeLessThan(
      stripeMocks.createSession.mock.invocationCallOrder[0],
    );
    expect(stripeMocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingCreatorCheckoutId: "pcc_1",
        idempotencyKey: "aera:creator-checkout:pcc_1",
      }),
    );
    expect(prisma.pendingCreatorCheckout.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "OPEN",
          stripeSessionId: "cs_1",
          expiresAt: stripeExpiresAt,
        }),
      }),
    );
  });

  it("resumes the persisted Stripe Session instead of creating a duplicate", async () => {
    const stripeExpiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    prisma.pendingCreatorCheckout.findFirst.mockResolvedValue({
      id: "pcc_1",
      tenantId: "t1",
      userId: "u1",
      plan: "PRO",
      status: "OPEN",
      stripeSessionId: "cs_1",
      expiresAt: stripeExpiresAt,
    });
    stripeMocks.retrieveSession.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.test/cs_1",
      status: "open",
      expiresAt: stripeExpiresAt,
      stripeSubscriptionId: null,
    });

    const url = await startTrackedCreatorPlanCheckout(args);

    expect(url).toBe("https://checkout.stripe.test/cs_1");
    expect(stripeMocks.createSession).not.toHaveBeenCalled();
    expect(stripeMocks.retrieveSession).toHaveBeenCalledWith("cs_1");
  });

  it("does not let a second admin replace the owner of an in-flight intent", async () => {
    prisma.pendingCreatorCheckout.findFirst.mockResolvedValue({
      id: "pcc_1",
      tenantId: "t1",
      userId: "u_other",
      plan: "PRO",
      status: "CREATING",
      stripeSessionId: null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    });

    const url = await startTrackedCreatorPlanCheckout(args);

    expect(url).toBeNull();
    expect(stripeMocks.createSession).not.toHaveBeenCalled();
    expect(stripeMocks.retrieveSession).not.toHaveBeenCalled();
  });

  it("expires only a Stripe-confirmed stale Session before counting blockers", async () => {
    prisma.pendingCreatorCheckout.findMany.mockResolvedValue([
      { id: "pcc_old", status: "OPEN", stripeSessionId: "cs_old" },
    ]);
    stripeMocks.retrieveSession.mockResolvedValue({
      id: "cs_old",
      url: null,
      status: "expired",
      expiresAt: new Date(Date.now() - 24 * 60 * 60_000),
      stripeSubscriptionId: null,
    });
    prisma.pendingCreatorCheckout.count.mockResolvedValue(1);

    await expect(countOpenCreatorCheckouts("t1")).resolves.toBe(1);

    expect(prisma.pendingCreatorCheckout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          status: { in: ["CREATING", "OPEN"] },
          expiresAt: { lte: expect.any(Date) },
        }),
        select: { id: true, status: true, stripeSessionId: true },
      }),
    );
    expect(prisma.pendingCreatorCheckout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "EXPIRED" }) }),
    );
  });
});
