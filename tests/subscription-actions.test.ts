import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  cancelMembershipStripeSubscription: vi.fn(),
  assertStripeSubscriptionsInactive: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    setTenantContext: vi.fn(),
    withTenantTransaction: (fn: (tx: typeof prisma) => unknown) => fn(prisma),
  };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/stripe-cleanup", () => ({
  cancelMembershipStripeSubscription: mocks.cancelMembershipStripeSubscription,
  assertStripeSubscriptionsInactive: mocks.assertStripeSubscriptionsInactive,
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/action-errors", () => ({
  getErrorTranslator: vi.fn(async () => (key: string) => key),
}));

import prismaModule from "@/lib/prisma";
import {
  cancelOwnMembershipAction,
  leaveOwnCommunityAction,
} from "@/app/actions/subscription";

const prisma = prismaModule as unknown as PrismaMock;

function form(): FormData {
  const fd = new FormData();
  fd.set("tenant", "demo");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
  prisma.tenant.findUnique.mockResolvedValue({ id: "t1", slug: "demo" });
  prisma.membership.findUnique.mockResolvedValue({
    id: "m1",
    tenantId: "t1",
    userId: "u1",
    role: "MEMBER",
    tier: { priceCents: 1900, entitlementKey: "tier:pro", slug: "pro" },
  });
  prisma.membershipTier.findFirst.mockResolvedValue({ id: "tier_free" });
  prisma.subscription.findMany.mockResolvedValue([]);
  mocks.assertStripeSubscriptionsInactive.mockResolvedValue(undefined);
  prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
  prisma.entitlement.deleteMany.mockResolvedValue({ count: 1 });
  prisma.membership.delete.mockResolvedValue({});
});

describe("cancelOwnMembershipAction", () => {
  it("downgrades immediately after Stripe ends a recovery-state subscription", async () => {
    prisma.subscription.findMany.mockResolvedValue([{
      id: "sub_local",
      stripeSubscriptionId: "sub_past_due",
      status: "PAST_DUE",
      currentPeriodEnd: null,
    }]);
    mocks.cancelMembershipStripeSubscription.mockResolvedValue({
      mode: "immediate",
      currentPeriodEnd: null,
    });

    const result = await cancelOwnMembershipAction({}, form());

    expect(result).toEqual({ ok: true });
    expect(mocks.cancelMembershipStripeSubscription).toHaveBeenCalledWith("sub_past_due");
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub_local" },
      data: { status: "CANCELED", cancelAtPeriodEnd: false },
    });
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { tierId: "tier_free" },
    });
  });

  it("does not mutate local access when Stripe cancellation fails", async () => {
    prisma.subscription.findMany.mockResolvedValue([{
      id: "sub_local",
      stripeSubscriptionId: "sub_live",
      status: "PAST_DUE",
    }]);
    mocks.cancelMembershipStripeSubscription.mockRejectedValue(new Error("Stripe unavailable"));

    const result = await cancelOwnMembershipAction({}, form());

    expect(result).toEqual({ error: "stripeCancelFailed" });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(prisma.entitlement.deleteMany).not.toHaveBeenCalled();
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  it("cancels every historical Stripe subscription instead of only the newest row", async () => {
    const firstEnd = new Date("2026-08-10T00:00:00Z");
    const secondEnd = new Date("2026-09-10T00:00:00Z");
    prisma.subscription.findMany.mockResolvedValue([
      {
        id: "sub_local_new",
        stripeSubscriptionId: "sub_new",
        status: "ACTIVE",
        currentPeriodEnd: null,
      },
      {
        id: "sub_local_old",
        stripeSubscriptionId: "sub_old",
        status: "ACTIVE",
        currentPeriodEnd: null,
      },
    ]);
    mocks.cancelMembershipStripeSubscription
      .mockResolvedValueOnce({ mode: "period_end", currentPeriodEnd: firstEnd })
      .mockResolvedValueOnce({ mode: "period_end", currentPeriodEnd: secondEnd });

    const result = await cancelOwnMembershipAction({}, form());

    expect(result).toEqual({ ok: true });
    expect(mocks.cancelMembershipStripeSubscription).toHaveBeenNthCalledWith(1, "sub_new");
    expect(mocks.cancelMembershipStripeSubscription).toHaveBeenNthCalledWith(2, "sub_old");
    expect(prisma.subscription.update).toHaveBeenCalledTimes(2);
    expect(prisma.entitlement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { expiresAt: secondEnd } }),
    );
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });
});

describe("leaveOwnCommunityAction", () => {
  it("does not remove a membership while Stripe can still charge it", async () => {
    prisma.subscription.findMany.mockResolvedValue([
      { stripeSubscriptionId: "sub_live" },
    ]);
    mocks.assertStripeSubscriptionsInactive.mockRejectedValue(new Error("still active"));

    await leaveOwnCommunityAction(form());

    expect(mocks.assertStripeSubscriptionsInactive).toHaveBeenCalledWith(["sub_live"]);
    expect(prisma.membership.delete).not.toHaveBeenCalled();
    expect(prisma.entitlement.deleteMany).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("allows leaving when no live Stripe subscription exists", async () => {
    prisma.subscription.findMany.mockResolvedValue([]);

    await leaveOwnCommunityAction(form());

    expect(prisma.membership.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
    expect(mocks.redirect).toHaveBeenCalledWith("/c/demo");
  });
});
