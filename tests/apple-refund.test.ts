import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  reversePointsByReference: vi.fn(),
  reverseReferralPurchaseByRef: vi.fn(),
  recordReferralPurchase: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    systemPrisma: prisma,
    setTenantContext: vi.fn(),
    withTenantContext: (_: string, fn: () => unknown) => fn(),
    withTenantTransaction: (fn: (tx: unknown) => unknown) => fn(prisma),
  };
});
vi.mock("@/lib/entitlements", () => ({
  grantEntitlement: vi.fn(),
  revokePreviousTierEntitlement: vi.fn(),
}));
vi.mock("@/lib/gamification", () => ({
  awardPoints: vi.fn(async () => undefined),
  reversePointsByReference: mocks.reversePointsByReference,
}));
vi.mock("@/lib/referrals", () => ({
  recordReferralPurchase: mocks.recordReferralPurchase,
  reverseReferralPurchaseByRef: mocks.reverseReferralPurchaseByRef,
}));
vi.mock("@/lib/stripe", () => ({ platformFeeCents: () => 0 }));
vi.mock("@/lib/webhooks", () => ({ emitWebhookEvent: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/apple-products", () => ({
  parseSubscriptionAppleProductId: vi.fn(),
  parseTipAppleProductId: vi.fn(() => 300),
  productAppleProductId: vi.fn(),
  tierAppleProductId: vi.fn(),
  unlockAppleProductId: vi.fn(() => "so.aera.unlock.500"),
}));

import prismaModule from "@/lib/prisma";
import { fulfillOneTimePurchase, reverseAppleOrder } from "@/lib/mobile/apple-fulfillment";
import type { JWSTransactionDecodedPayload } from "@/lib/apple-iap";

const prisma = prismaModule as unknown as PrismaMock;
const tenant = { id: "t1", platformFeePercent: 5 } as Parameters<typeof fulfillOneTimePurchase>[0]["tenant"];

beforeEach(() => {
  vi.clearAllMocks();
  prisma.order.updateMany.mockResolvedValue({ count: 1 });
  prisma.order.count.mockResolvedValue(0);
});

describe("reverseAppleOrder", () => {
  it("reverses referral commission, refunds the tip and cancels the booking", async () => {
    const order = {
      id: "o1",
      tenantId: "t1",
      userId: "u1",
      productId: null,
      refundedAt: null,
      grantedEntitlementKey: null,
    };
    prisma.order.findUnique.mockResolvedValue(order);

    await expect(reverseAppleOrder("txn_1", "notif_1")).resolves.toBe(true);

    expect(mocks.reversePointsByReference).toHaveBeenCalledWith(
      expect.objectContaining({ refType: "AppleTransaction", refId: "txn_1", reversalRefId: "notif_1" }),
    );
    expect(mocks.reverseReferralPurchaseByRef).toHaveBeenCalledWith({
      tenantId: "t1",
      refType: "AppleTransaction",
      refId: "txn_1",
    });
    expect(prisma.tip.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", appleTransactionId: "txn_1", status: "PAID" },
      data: { status: "REFUNDED" },
    });
    expect(prisma.bookingReservation.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", appleTransactionId: "txn_1", status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    });
  });

  it("is a no-op for unknown transactions", async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(reverseAppleOrder("txn_unknown", "notif_1")).resolves.toBe(false);
    expect(prisma.tip.updateMany).not.toHaveBeenCalled();
  });
});

describe("fulfillOneTimePurchase links tips and bookings to the transaction", () => {
  const txn = { transactionId: "txn_9", productId: "so.aera.unlock.500" } as JWSTransactionDecodedPayload;

  beforeEach(() => {
    prisma.order.findUnique.mockResolvedValue(null);
    prisma.order.create.mockResolvedValue({ id: "o9" });
  });

  it("stores the transaction on the tip", async () => {
    prisma.space.findFirst.mockResolvedValue({ id: "tips" });

    await fulfillOneTimePurchase({ tenant, userId: "u1", kind: "tip", refId: "tips", txn });

    expect(prisma.tip.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "PAID", appleTransactionId: "txn_9" }),
    });
  });

  it("stores the transaction on the reservation it confirms", async () => {
    prisma.bookingSlot.findFirst.mockResolvedValue({ id: "slot1", title: "Coaching", priceCents: 500, currency: "eur" });
    prisma.bookingReservation.findFirst.mockResolvedValue({ id: "r1", status: "PENDING" });

    await fulfillOneTimePurchase({ tenant, userId: "u1", kind: "booking", refId: "slot1", txn });

    expect(prisma.bookingReservation.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { status: "CONFIRMED", appleTransactionId: "txn_9" },
    });
  });

  it("does not bind a reservation that was already confirmed by another payment", async () => {
    prisma.bookingSlot.findFirst.mockResolvedValue({ id: "slot1", title: "Coaching", priceCents: 500, currency: "eur" });
    prisma.bookingReservation.findFirst.mockResolvedValue({ id: "r1", status: "CONFIRMED" });

    await fulfillOneTimePurchase({ tenant, userId: "u1", kind: "booking", refId: "slot1", txn });

    expect(prisma.bookingReservation.update).not.toHaveBeenCalled();
  });
});
