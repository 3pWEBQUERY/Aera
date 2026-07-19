import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  requireTenantAdmin: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  assertInactive: vi.fn(),
  cancelImmediately: vi.fn(),
  deleteConnect: vi.fn(),
  writeAudit: vi.fn(),
  revalidatePath: vi.fn(),
  countOpenCreatorCheckouts: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    setTenantContext: vi.fn(),
    systemPrisma: prisma,
    withTenantTransaction: (fn: (tx: typeof prisma) => unknown) => fn(prisma),
  };
});
vi.mock("@/lib/guards", () => ({
  requireTenantAdmin: mocks.requireTenantAdmin,
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock("@/lib/stripe-cleanup", () => ({
  assertStripeSubscriptionsInactive: mocks.assertInactive,
  cancelStripeSubscriptionsImmediately: mocks.cancelImmediately,
  deleteStripeConnectAccount: mocks.deleteConnect,
  StripeSubscriptionStillActiveError: class StripeSubscriptionStillActiveError extends Error {
    constructor(
      readonly stripeSubscriptionId: string,
      readonly stripeStatus: string,
    ) {
      super("active Stripe subscription");
    }
  },
}));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/creator-checkout", () => ({
  countOpenCreatorCheckouts: mocks.countOpenCreatorCheckouts,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/action-errors", () => ({
  tErr: vi.fn(async (key: string) => key),
  zodErr: vi.fn(async () => "invalidData"),
}));

import prismaModule from "@/lib/prisma";
import {
  deleteMemberAction,
  deleteProductAction,
  deleteTenantAction,
  deleteTierAction,
  updateMemberAction,
} from "@/app/actions/dashboard";
import { adminDeleteTenantAction } from "@/app/actions/admin";

const prisma = prismaModule as unknown as PrismaMock;

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertInactive.mockResolvedValue(undefined);
  mocks.cancelImmediately.mockResolvedValue(undefined);
  mocks.deleteConnect.mockResolvedValue(undefined);
  mocks.countOpenCreatorCheckouts.mockResolvedValue(0);
  mocks.requireTenantAdmin.mockResolvedValue({
    tenant: {
      id: "t1",
      slug: "demo",
      name: "Demo",
      stripeAccountId: null,
    },
    user: { id: "owner" },
    role: "OWNER",
  });
  mocks.requirePlatformAdmin.mockResolvedValue({ id: "platform-admin" });
  prisma.subscription.findMany.mockResolvedValue([]);
  prisma.aiCreditWallet.findUnique.mockResolvedValue(null);
  prisma.order.count.mockResolvedValue(0);
  prisma.bookingReservation.count.mockResolvedValue(0);
  prisma.pendingCreatorCheckout.count.mockResolvedValue(0);
  prisma.dataDeletionJob.upsert.mockResolvedValue({ id: "deletion-job-1" });
});

describe("destructive Stripe billing actions", () => {
  it("does not remove a member when Stripe cancellation fails", async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: "m1",
      tenantId: "t1",
      userId: "member",
      role: "MEMBER",
    });
    prisma.subscription.findMany.mockResolvedValue([
      { stripeSubscriptionId: "sub_live" },
    ]);
    mocks.cancelImmediately.mockRejectedValue(new Error("Stripe unavailable"));

    const result = await deleteMemberAction(
      form({ tenant: "demo", membershipId: "m1" }),
    );

    expect(result).toEqual({ error: "memberRemoveStripeFailed" });
    expect(prisma.membership.delete).not.toHaveBeenCalled();
    expect(prisma.entitlement.deleteMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "member.remove.blocked" }),
    );
  });

  it("cancels Stripe before removing the member locally", async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: "m1",
      tenantId: "t1",
      userId: "member",
      role: "MEMBER",
    });
    prisma.subscription.findMany.mockResolvedValue([
      { stripeSubscriptionId: "sub_live" },
    ]);

    await expect(
      deleteMemberAction(form({ tenant: "demo", membershipId: "m1" })),
    ).resolves.toEqual({ ok: true });

    expect(mocks.cancelImmediately).toHaveBeenCalledWith(["sub_live"]);
    expect(mocks.cancelImmediately.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.membership.delete.mock.invocationCallOrder[0],
    );
  });

  it("does not change a paid member locally when Stripe cleanup fails", async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: "m1",
      tenantId: "t1",
      userId: "member",
      role: "MEMBER",
      tierId: "tier_old",
    });
    prisma.membershipTier.findFirst.mockResolvedValue({
      id: "tier_new",
      entitlementKey: "tier:new",
    });
    prisma.subscription.findMany.mockResolvedValue([
      { stripeSubscriptionId: "sub_live" },
    ]);
    mocks.cancelImmediately.mockRejectedValue(new Error("Stripe unavailable"));

    const result = await updateMemberAction(
      {},
      form({
        tenant: "demo",
        membershipId: "m1",
        role: "MEMBER",
        status: "ACTIVE",
        tierId: "tier_new",
      }),
    );

    expect(result).toEqual({ error: "stripeCancelFailed" });
    expect(mocks.cancelImmediately).toHaveBeenCalledWith(["sub_live"]);
    expect(prisma.membership.update).not.toHaveBeenCalled();
    expect(prisma.entitlement.deleteMany).not.toHaveBeenCalled();
  });

  it("ends remote billing and tier access before banning a member", async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: "m1",
      tenantId: "t1",
      userId: "member",
      role: "MEMBER",
      tierId: "tier_paid",
    });
    prisma.membershipTier.findFirst.mockResolvedValue({
      id: "tier_paid",
      entitlementKey: "tier:paid",
    });
    prisma.subscription.findMany.mockResolvedValue([
      { stripeSubscriptionId: "sub_live" },
    ]);

    await expect(
      updateMemberAction(
        {},
        form({
          tenant: "demo",
          membershipId: "m1",
          role: "MEMBER",
          status: "BANNED",
          tierId: "tier_paid",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(mocks.cancelImmediately).toHaveBeenCalledWith(["sub_live"]);
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CANCELED", cancelAtPeriodEnd: false } }),
    );
    expect(prisma.entitlement.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        userId: "member",
        key: "tier:paid",
      },
    });
  });

  it("blocks tier deletion until Stripe confirms all subscriptions are terminal", async () => {
    prisma.membershipTier.findFirst.mockResolvedValue({
      id: "tier1",
      isDefault: false,
      priceCents: 0,
      entitlementKey: "tier:pro",
    });
    prisma.subscription.findMany.mockResolvedValue([
      { stripeSubscriptionId: "sub_live" },
    ]);
    mocks.assertInactive.mockRejectedValue(new Error("still active"));

    const result = await deleteTierAction(form({ tenant: "demo", tierId: "tier1" }));

    expect(result).toEqual({ error: "tierDeleteStripeBlocked" });
    expect(prisma.membershipTier.delete).not.toHaveBeenCalled();
    expect(prisma.subscription.deleteMany).not.toHaveBeenCalled();
  });

  it("archives a paid tier instead of deleting a row referenced by an open Checkout", async () => {
    prisma.membershipTier.findFirst.mockResolvedValue({
      id: "tier_paid",
      isDefault: false,
      isPublic: true,
      priceCents: 1900,
      entitlementKey: "tier:paid",
    });

    const result = await deleteTierAction(
      form({ tenant: "demo", tierId: "tier_paid" }),
    );

    expect(result).toEqual({ error: "paidTierArchivedInsteadOfDeleted" });
    expect(prisma.membershipTier.update).toHaveBeenCalledWith({
      where: { id: "tier_paid" },
      data: { isPublic: false },
    });
    expect(prisma.membershipTier.delete).not.toHaveBeenCalled();
  });

  it("archives a product while any order can still reference its Checkout", async () => {
    prisma.product.findFirst.mockResolvedValue({ id: "product1" });
    prisma.order.count.mockResolvedValue(1);

    const result = await deleteProductAction(
      form({ tenant: "demo", productId: "product1" }),
    );

    expect(result).toEqual({ error: "productArchivedBecauseOrdersExist" });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: "product1" },
      data: { isPublished: false },
    });
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it("queues owner-community Connect cleanup instead of deleting synchronously", async () => {
    mocks.requireTenantAdmin.mockResolvedValue({
      tenant: {
        id: "t1",
        slug: "demo",
        name: "Demo",
        stripeAccountId: "acct_1",
      },
      user: { id: "owner" },
      role: "OWNER",
    });
    const result = await deleteTenantAction(form({ tenant: "demo", confirm: "demo" }));

    expect(result).toEqual({ ok: true });
    expect(prisma.tenant.delete).not.toHaveBeenCalled();
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "DELETING" } }),
    );
    expect(prisma.dataDeletionJob.upsert).toHaveBeenCalled();
    expect(mocks.deleteConnect).not.toHaveBeenCalled();
  });

  it("blocks community deletion while a pending order could still be paid", async () => {
    prisma.order.count.mockResolvedValue(1);

    const result = await deleteTenantAction(form({ tenant: "demo", confirm: "demo" }));

    expect(result).toEqual({ error: "pendingPaymentsBlockDeletion" });
    expect(mocks.assertInactive).not.toHaveBeenCalled();
    expect(prisma.tenant.delete).not.toHaveBeenCalled();
  });

  it("blocks community deletion while a creator-plan Checkout is still open", async () => {
    mocks.countOpenCreatorCheckouts.mockResolvedValue(1);

    const result = await deleteTenantAction(form({ tenant: "demo", confirm: "demo" }));

    expect(result).toEqual({ error: "pendingPaymentsBlockDeletion" });
    expect(mocks.assertInactive).not.toHaveBeenCalled();
    expect(prisma.tenant.delete).not.toHaveBeenCalled();
  });

  it("queues platform-admin Connect cleanup instead of deleting synchronously", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "demo",
      name: "Demo",
      stripeAccountId: "acct_1",
    });
    const result = await adminDeleteTenantAction(
      form({ tenantId: "t1", confirm: "demo" }),
    );

    expect(result).toEqual({ ok: true });
    expect(prisma.tenant.delete).not.toHaveBeenCalled();
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "DELETING" } }),
    );
    expect(prisma.dataDeletionJob.upsert).toHaveBeenCalled();
    expect(mocks.deleteConnect).not.toHaveBeenCalled();
  });

  it("blocks platform-admin deletion while a creator Checkout is open", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "demo",
      name: "Demo",
      stripeAccountId: null,
    });
    mocks.countOpenCreatorCheckouts.mockResolvedValue(1);

    const result = await adminDeleteTenantAction(
      form({ tenantId: "t1", confirm: "demo" }),
    );

    expect(result).toEqual({ error: "pendingPaymentsBlockDeletion" });
    expect(mocks.assertInactive).not.toHaveBeenCalled();
    expect(prisma.tenant.delete).not.toHaveBeenCalled();
  });
});
