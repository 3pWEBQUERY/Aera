import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  constructWebhookEvent: vi.fn(),
  grantEntitlement: vi.fn(),
  revokePreviousTierEntitlement: vi.fn(),
  awardPoints: vi.fn(),
  reversePointsByReference: vi.fn(),
  grantPaidCreditPack: vi.fn(),
  refundPaidCreditPack: vi.fn(),
  recordReferralPurchase: vi.fn(),
  reverseReferralPurchase: vi.fn(),
  activatePaidCreatorPlan: vi.fn(),
  updateCreatorSubscription: vi.fn(),
  endCreatorSubscription: vi.fn(),
  refillCreatorPlanFromPaidInvoice: vi.fn(),
  reverseDestinationTransferForRefunds: vi.fn(),
  reverseDestinationTransferForDispute: vi.fn(),
  cancelAndRefundOrphanCreatorSubscription: vi.fn(),
  completeTrackedCreatorCheckout: vi.fn(),
  failTrackedCreatorCheckout: vi.fn(),
  refundCreate: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  checkoutSessionRetrieve: vi.fn(),
  checkoutSessionList: vi.fn(),
  emitWebhookEvent: vi.fn(),
  getStripe: vi.fn<() => unknown>(() => null),
}));
const { constructWebhookEvent, grantEntitlement, awardPoints } = mocks;

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    setTenantContext: vi.fn(),
    withTenantContext: (_: string, fn: () => unknown) => fn(),
    withTenantTransaction: (fn: (tx: unknown) => unknown) => fn(prisma),
  };
});

vi.mock("@/lib/stripe", () => ({
  constructWebhookEvent: mocks.constructWebhookEvent,
  getStripe: mocks.getStripe,
  reverseDestinationTransferForRefunds: mocks.reverseDestinationTransferForRefunds,
  reverseDestinationTransferForDispute: mocks.reverseDestinationTransferForDispute,
  cancelAndRefundOrphanCreatorSubscription: mocks.cancelAndRefundOrphanCreatorSubscription,
  platformFeeCents: (amount: number, percent: number) =>
    Math.round((amount * percent) / 100),
}));

vi.mock("@/lib/creator-checkout", () => ({
  completeTrackedCreatorCheckout: mocks.completeTrackedCreatorCheckout,
  failTrackedCreatorCheckout: mocks.failTrackedCreatorCheckout,
}));

vi.mock("@/lib/entitlements", () => ({
  grantEntitlement: mocks.grantEntitlement,
  revokePreviousTierEntitlement: mocks.revokePreviousTierEntitlement,
}));

vi.mock("@/lib/gamification", () => ({
  awardPoints: mocks.awardPoints,
  reversePointsByReference: mocks.reversePointsByReference,
}));

vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));

vi.mock("@/lib/credits", () => ({
  grantPaidCreditPack: mocks.grantPaidCreditPack,
  refundPaidCreditPack: mocks.refundPaidCreditPack,
  activatePaidCreatorPlan: mocks.activatePaidCreatorPlan,
  updateCreatorSubscription: mocks.updateCreatorSubscription,
  endCreatorSubscription: mocks.endCreatorSubscription,
  refillCreatorPlanFromPaidInvoice: mocks.refillCreatorPlanFromPaidInvoice,
}));

vi.mock("@/lib/referrals", () => ({
  recordReferralPurchase: mocks.recordReferralPurchase,
  reverseReferralPurchase: mocks.reverseReferralPurchase,
}));

vi.mock("@/lib/webhooks", () => ({
  emitWebhookEvent: mocks.emitWebhookEvent,
}));

import prismaModule from "@/lib/prisma";
const prisma = prismaModule as unknown as PrismaMock;

import { POST } from "@/app/api/stripe/webhook/route";

function request(body = "{}", sig: string | null = "sig_test"): Request {
  const headers = new Headers();
  if (sig) headers.set("stripe-signature", sig);
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers,
    body,
  });
}

function tierCheckoutEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        subscription: "sub_1",
        payment_status: "paid",
        metadata: { tenantId: "t1", userId: "u1", kind: "tier", tierId: "tier1" },
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscriptionRetrieve.mockResolvedValue({
    id: "sub_1",
    status: "active",
    metadata: {},
  });
  mocks.checkoutSessionRetrieve.mockResolvedValue({ id: "cs_1", metadata: {} });
  mocks.checkoutSessionList.mockResolvedValue({ data: [] });
  mocks.getStripe.mockReturnValue({
    subscriptions: { retrieve: mocks.subscriptionRetrieve },
    invoicePayments: { list: vi.fn().mockResolvedValue({ data: [] }) },
    invoices: { retrieve: vi.fn() },
    checkout: {
      sessions: {
        retrieve: mocks.checkoutSessionRetrieve,
        list: mocks.checkoutSessionList,
      },
    },
  });
  prisma.tenant.findUnique.mockResolvedValue({ id: "t1", platformFeePercent: 5 });
  prisma.stripeWebhookEvent.create.mockResolvedValue({ id: "evt" });
  prisma.stripeWebhookEvent.update.mockResolvedValue({});
  prisma.stripeWebhookEvent.updateMany.mockResolvedValue({ count: 0 });
  prisma.order.updateMany.mockResolvedValue({ count: 1 });
  prisma.product.updateMany.mockResolvedValue({ count: 1 });
  prisma.auditLog?.create?.mockResolvedValue({});
  mocks.reverseDestinationTransferForRefunds.mockResolvedValue({
    reversedCents: 0,
    alreadyReversedCents: 0,
  });
  mocks.reverseDestinationTransferForDispute.mockResolvedValue({
    reversedCents: 0,
    alreadyReversedCents: 0,
  });
  mocks.refillCreatorPlanFromPaidInvoice.mockResolvedValue({ ok: true, refilled: true });
  mocks.activatePaidCreatorPlan.mockResolvedValue({ ok: true });
  mocks.grantPaidCreditPack.mockResolvedValue({ ok: true });
  mocks.cancelAndRefundOrphanCreatorSubscription.mockResolvedValue({
    subscriptionCanceled: true,
    refundedCents: 4900,
  });
});

describe("POST /api/stripe/webhook", () => {
  it("rejects requests without a signature", async () => {
    const res = await POST(request("{}", null));
    expect(res.status).toBe(400);
    expect(constructWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects requests with an invalid signature", async () => {
    constructWebhookEvent.mockReturnValue(null);
    const res = await POST(request());
    expect(res.status).toBe(400);
  });

  it("returns 500 when a handler throws, so Stripe retries", async () => {
    constructWebhookEvent.mockReturnValue(tierCheckoutEvent());
    prisma.tenant.findUnique.mockRejectedValue(new Error("db down"));
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt_1" },
        data: expect.objectContaining({ status: "FAILED", lastError: "db down" }),
      }),
    );
  });

  it("skips an event that the durable inbox already completed", async () => {
    constructWebhookEvent.mockReturnValue(tierCheckoutEvent());
    prisma.stripeWebhookEvent.create.mockRejectedValueOnce({ code: "P2002" });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue({
      id: "evt_1",
      status: "COMPLETED",
      updatedAt: new Date(),
    });

    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(prisma.membership.upsert).not.toHaveBeenCalled();
  });

  describe("checkout.session.completed (tier)", () => {
    it("activates membership, records subscription, grants entitlement, awards points", async () => {
      constructWebhookEvent.mockReturnValue(tierCheckoutEvent());
      prisma.membershipTier.findFirst.mockResolvedValue({
        id: "tier1", tenantId: "t1", entitlementKey: "tier:vip",
      });
      prisma.subscription.findUnique.mockResolvedValue(null); // not yet recorded
      prisma.membership.upsert.mockResolvedValue({});
      prisma.subscription.create.mockResolvedValue({});

      const res = await POST(request());
      expect(res.status).toBe(200);

      expect(prisma.membership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: "ACTIVE", tierId: "tier1" }),
        }),
      );
      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stripeSubscriptionId: "sub_1", status: "ACTIVE" }),
        }),
      );
      expect(grantEntitlement).toHaveBeenCalledWith(
        expect.objectContaining({ key: "tier:vip", source: "TIER" }),
      );
      expect(awardPoints).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: "PURCHASE" }),
      );
    });

    it("repairs grants on retry without creating a second subscription", async () => {
      constructWebhookEvent.mockReturnValue(tierCheckoutEvent());
      prisma.membershipTier.findFirst.mockResolvedValue({
        id: "tier1", tenantId: "t1", entitlementKey: "tier:vip",
      });
      prisma.subscription.findUnique.mockResolvedValue({ id: "existing" });

      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(prisma.subscription.create).not.toHaveBeenCalled();
      expect(prisma.membership.upsert).toHaveBeenCalled();
      expect(grantEntitlement).toHaveBeenCalledWith(
        expect.objectContaining({ key: "tier:vip", source: "TIER" }),
      );
    });

    it("does not grant tier access until the subscription Checkout is paid", async () => {
      constructWebhookEvent.mockReturnValue(
        tierCheckoutEvent({ payment_status: "unpaid" }),
      );

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.subscription.create).not.toHaveBeenCalled();
      expect(prisma.membership.upsert).not.toHaveBeenCalled();
      expect(grantEntitlement).not.toHaveBeenCalled();
    });

    it("cancels and refunds a paid tier Checkout whose tier was deleted", async () => {
      constructWebhookEvent.mockReturnValue(tierCheckoutEvent());
      prisma.membershipTier.findFirst.mockResolvedValue(null);

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.cancelAndRefundOrphanCreatorSubscription).toHaveBeenCalledWith({
        stripeSubscriptionId: "sub_1",
        reverseDestinationTransfer: true,
      });
      expect(grantEntitlement).not.toHaveBeenCalled();
    });

    it("ignores events without tenant/user metadata", async () => {
      constructWebhookEvent.mockReturnValue(
        tierCheckoutEvent({ metadata: {} }),
      );
      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(prisma.membership.upsert).not.toHaveBeenCalled();
    });
  });

  describe("checkout.session.completed (product)", () => {
    function productEvent() {
      return {
        id: "evt_2",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_2",
            metadata: { tenantId: "t1", userId: "u1", kind: "product", productId: "prod1" },
            amount_total: 5000,
            currency: "eur",
            payment_intent: "pi_1",
            payment_status: "paid",
          },
        },
      };
    }

    it("creates a PAID order with the platform fee and grants the product key", async () => {
      constructWebhookEvent.mockReturnValue(productEvent());
      prisma.product.findFirst.mockResolvedValue({
        id: "prod1", tenantId: "t1", name: "E-Book", priceCents: 5000,
        currency: "eur", stock: null, grantsEntitlementKey: "product:ebook",
      });
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.order.create.mockResolvedValue({});

      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PAID",
            amountCents: 5000,
            platformFeeCents: 250, // 5 % of 5000
            stripeSessionId: "cs_2",
          }),
        }),
      );
      expect(grantEntitlement).toHaveBeenCalledWith(
        expect.objectContaining({ key: "product:ebook", source: "PURCHASE" }),
      );
      // Digital product (stock null) -> no inventory decrement.
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it("decrements stock for physical products, never below zero", async () => {
      constructWebhookEvent.mockReturnValue(productEvent());
      prisma.product.findFirst.mockResolvedValue({
        id: "prod1", tenantId: "t1", name: "Shirt", priceCents: 5000,
        currency: "eur", stock: 3, grantsEntitlementKey: null,
      });
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.order.create.mockResolvedValue({});

      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(prisma.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stock: { gt: 0 } }),
          data: { stock: { decrement: 1 } },
        }),
      );
    });

    it("settles a pre-reserved paid order without decrementing stock twice", async () => {
      const event = productEvent();
      (event.data.object as { metadata: Record<string, string> }).metadata = {
        ...event.data.object.metadata,
        orderId: "ord_reserved",
      };
      constructWebhookEvent.mockReturnValue(event);
      prisma.product.findFirst.mockResolvedValue({
        id: "prod1", tenantId: "t1", name: "Shirt", priceCents: 5000,
        currency: "eur", stock: 0, grantsEntitlementKey: null,
      });
      prisma.order.findFirst.mockResolvedValue({
        status: "PENDING",
        inventoryReleasedAt: null,
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "ord_reserved", status: "PENDING" }),
          data: expect.objectContaining({
            status: "PAID",
            stripeSessionId: "cs_2",
            stripePaymentIntentId: "pi_1",
          }),
        }),
      );
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });

    it("auto-refunds a paid checkout whose reservation cannot be settled", async () => {
      const event = productEvent();
      (event.data.object as { metadata: Record<string, string> }).metadata = {
        ...event.data.object.metadata,
        orderId: "ord_released",
      };
      constructWebhookEvent.mockReturnValue(event);
      prisma.product.findFirst.mockResolvedValue({
        id: "prod1", tenantId: "t1", name: "Shirt", priceCents: 5000,
        currency: "eur", stock: 0, grantsEntitlementKey: null,
      });
      prisma.order.findFirst.mockResolvedValue({
        status: "FAILED",
        inventoryReleasedAt: new Date(),
      });
      mocks.refundCreate.mockResolvedValue({ id: "re_auto" });
      mocks.getStripe.mockReturnValue({ refunds: { create: mocks.refundCreate } });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.refundCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: "pi_1",
          reverse_transfer: true,
          refund_application_fee: true,
        }),
        { idempotencyKey: "aera:unfulfillable-product:cs_2" },
      );
      expect(grantEntitlement).not.toHaveBeenCalled();
    });

    it("repairs entitlement on retry without creating another order or decrementing stock", async () => {
      constructWebhookEvent.mockReturnValue(productEvent());
      prisma.product.findFirst.mockResolvedValue({
        id: "prod1", tenantId: "t1", name: "E-Book", priceCents: 5000,
        currency: "eur", stock: null, grantsEntitlementKey: "product:ebook",
      });
      prisma.order.findUnique.mockResolvedValue({ id: "existing-order" });

      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(grantEntitlement).toHaveBeenCalledWith(
        expect.objectContaining({ key: "product:ebook", source: "PURCHASE" }),
      );
    });

    it("does not fulfill an unpaid one-time checkout", async () => {
      const event = productEvent();
      event.data.object.payment_status = "unpaid";
      constructWebhookEvent.mockReturnValue(event);

      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(grantEntitlement).not.toHaveBeenCalled();
    });

    it("refunds a paid marketplace Checkout when its tenant was deleted", async () => {
      constructWebhookEvent.mockReturnValue(productEvent());
      prisma.tenant.findUnique.mockResolvedValue(null);
      mocks.refundCreate.mockResolvedValue({ id: "re_tenant_missing" });
      mocks.getStripe.mockReturnValue({ refunds: { create: mocks.refundCreate } });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.refundCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: "pi_1",
          reverse_transfer: true,
          refund_application_fee: true,
        }),
        { idempotencyKey: "aera:unfulfillable-product:cs_2" },
      );
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it("resumes a failed fulfillment without duplicating the recorded order", async () => {
      constructWebhookEvent.mockReturnValue(productEvent());
      prisma.product.findFirst.mockResolvedValue({
        id: "prod1", tenantId: "t1", name: "E-Book", priceCents: 5000,
        currency: "eur", stock: null, grantsEntitlementKey: "product:ebook",
      });
      prisma.order.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "existing-order" });
      prisma.order.create.mockResolvedValue({ id: "order-1" });
      mocks.grantEntitlement
        .mockRejectedValueOnce(new Error("temporary grant failure"))
        .mockResolvedValueOnce(undefined);

      const first = await POST(request());
      expect(first.status).toBe(500);

      prisma.stripeWebhookEvent.create.mockRejectedValueOnce({ code: "P2002" });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValueOnce({
        id: "evt_2",
        status: "FAILED",
        updatedAt: new Date(),
      });
      prisma.stripeWebhookEvent.updateMany.mockResolvedValueOnce({ count: 1 });
      const retry = await POST(request());

      expect(retry.status).toBe(200);
      expect(prisma.order.create).toHaveBeenCalledTimes(1);
      expect(mocks.grantEntitlement).toHaveBeenCalledTimes(2);
      expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "evt_2" },
          data: expect.objectContaining({ status: "COMPLETED" }),
        }),
      );
    });
  });

  it("releases reserved stock when a product Checkout Session expires", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_expired",
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_expired",
          metadata: {
            kind: "product",
            tenantId: "t1",
            userId: "u1",
            productId: "prod1",
            orderId: "ord1",
          },
        },
      },
    });
    prisma.order.findUnique.mockResolvedValue({
      id: "ord1",
      status: "PENDING",
      productId: "prod1",
      inventoryReservedAt: new Date(),
      inventoryReleasedAt: null,
    });
    prisma.product.update.mockResolvedValue({});

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "ord1",
          status: "PENDING",
          inventoryReleasedAt: null,
          OR: [
            { stripeSessionId: null },
            { stripeSessionId: "cs_expired" },
          ],
        }),
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: "prod1" },
      data: { stock: { increment: 1 } },
    });
  });

  describe("booking Checkout lifecycle", () => {
    it("cancels only the pending reservation bound to an expired Session", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_booking_expired",
        type: "checkout.session.expired",
        data: {
          object: {
            id: "cs_booking",
            metadata: {
              kind: "booking",
              tenantId: "t1",
              userId: "u1",
              reservationId: "br_1",
            },
          },
        },
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.bookingReservation.updateMany).toHaveBeenCalledWith({
        where: {
          id: "br_1",
          tenantId: "t1",
          status: "PENDING",
          OR: [{ stripeSessionId: null }, { stripeSessionId: "cs_booking" }],
        },
        data: { status: "CANCELLED", stripeSessionId: "cs_booking" },
      });
    });

    it("refunds a paid foreign Session for an already-bound reservation", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_booking_foreign",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_foreign",
            payment_status: "paid",
            payment_intent: "pi_foreign",
            metadata: {
              kind: "booking",
              tenantId: "t1",
              userId: "u1",
              reservationId: "br_1",
            },
          },
        },
      });
      prisma.bookingReservation.findFirst.mockResolvedValue({
        id: "br_1",
        status: "CONFIRMED",
        stripeSessionId: "cs_original",
        slot: { title: "Call", priceCents: 5000, currency: "eur" },
      });
      mocks.refundCreate.mockResolvedValue({ id: "re_booking" });
      mocks.getStripe.mockReturnValue({ refunds: { create: mocks.refundCreate } });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.refundCreate).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: "pi_foreign", reverse_transfer: true }),
        { idempotencyKey: "aera:unfulfillable-booking:cs_foreign" },
      );
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it("accepts the same Session when a concurrent delivery won the booking CAS", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_booking_race",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_booking",
            payment_status: "paid",
            payment_intent: "pi_booking",
            amount_total: 5000,
            currency: "eur",
            metadata: {
              kind: "booking",
              tenantId: "t1",
              userId: "u1",
              reservationId: "br_1",
            },
          },
        },
      });
      prisma.bookingReservation.findFirst.mockResolvedValue({
        id: "br_1",
        status: "PENDING",
        stripeSessionId: "cs_booking",
        slot: { title: "Call", priceCents: 5000, currency: "eur" },
      });
      prisma.order.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "order_winner" });
      prisma.bookingReservation.updateMany.mockResolvedValue({ count: 0 });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(mocks.refundCreate).not.toHaveBeenCalled();
    });
  });

  describe("creator billing", () => {
    it("marks a tracked creator Checkout expired without activating a plan", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_creator_expired",
        type: "checkout.session.expired",
        data: {
          object: {
            id: "cs_creator_expired",
            metadata: {
              tenantId: "t1",
              userId: "u1",
              kind: "creator_plan",
              plan: "PRO",
              pendingCreatorCheckoutId: "pcc_expired",
            },
          },
        },
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.failTrackedCreatorCheckout).toHaveBeenCalledWith({
        pendingCreatorCheckoutId: "pcc_expired",
        tenantId: "t1",
        stripeSessionId: "cs_creator_expired",
        status: "EXPIRED",
      });
      expect(mocks.activatePaidCreatorPlan).not.toHaveBeenCalled();
    });

    it("grants a paid AI credit pack from the verified checkout metadata", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_credit",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_credit",
            payment_status: "paid",
            payment_intent: "pi_credit",
            metadata: {
              tenantId: "t1",
              userId: "u1",
              kind: "ai_credit_pack",
              packId: "pack_5k",
            },
          },
        },
      });

      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(mocks.grantPaidCreditPack).toHaveBeenCalledWith({
        tenantId: "t1",
        userId: "u1",
        packId: "pack_5k",
        stripeSessionId: "cs_credit",
        stripePaymentIntentId: "pi_credit",
      });
    });

    it("refunds a platform credit-pack payment when its catalog entry is missing", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_credit_missing",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_credit_missing",
            payment_status: "paid",
            payment_intent: "pi_credit_missing",
            metadata: {
              tenantId: "t1",
              userId: "u1",
              kind: "ai_credit_pack",
              packId: "removed_pack",
            },
          },
        },
      });
      mocks.grantPaidCreditPack.mockResolvedValue({ ok: false, error: "missing" });
      mocks.refundCreate.mockResolvedValue({ id: "re_credit_missing" });
      mocks.getStripe.mockReturnValue({ refunds: { create: mocks.refundCreate } });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.refundCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({
          reverse_transfer: expect.anything(),
          refund_application_fee: expect.anything(),
        }),
        { idempotencyKey: "aera:unfulfillable-ai_credit_pack:cs_credit_missing" },
      );
    });

    it("activates a paid creator plan only with a Stripe subscription id", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_plan",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_plan",
            subscription: "sub_creator",
            customer: "cus_creator",
            metadata: {
              tenantId: "t1",
              userId: "u1",
              kind: "creator_plan",
              plan: "PRO",
              pendingCreatorCheckoutId: "pcc_1",
            },
          },
        },
      });

      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(mocks.activatePaidCreatorPlan).toHaveBeenCalledWith({
        tenantId: "t1",
        plan: "PRO",
        stripeSubscriptionId: "sub_creator",
        stripeCustomerId: "cus_creator",
      });
      expect(mocks.completeTrackedCreatorCheckout).toHaveBeenCalledWith({
        pendingCreatorCheckoutId: "pcc_1",
        tenantId: "t1",
        userId: "u1",
        plan: "PRO",
        stripeSessionId: "cs_plan",
        stripeSubscriptionId: "sub_creator",
      });
    });

    it("cancels and refunds a creator subscription completed after its tenant was deleted", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_orphan_plan",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_orphan",
            subscription: "sub_orphan",
            metadata: {
              tenantId: "deleted_tenant",
              userId: "u1",
              kind: "creator_plan",
              plan: "PRO",
              pendingCreatorCheckoutId: "pcc_deleted",
            },
          },
        },
      });
      prisma.tenant.findUnique.mockResolvedValue(null);

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.cancelAndRefundOrphanCreatorSubscription).toHaveBeenCalledWith({
        stripeSubscriptionId: "sub_orphan",
      });
      expect(mocks.activatePaidCreatorPlan).not.toHaveBeenCalled();
    });

    it("downgrades the creator wallet after Stripe ends the subscription", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_creator_end",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_creator",
            metadata: { kind: "creator_plan", tenantId: "t1" },
          },
        },
      });
      prisma.subscription.findUnique.mockResolvedValue(null);

      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(mocks.endCreatorSubscription).toHaveBeenCalledWith({
        tenantId: "t1",
        stripeSubscriptionId: "sub_creator",
      });
    });

    it("refills a creator allowance only after a recurring invoice was paid", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_invoice_paid",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_renewal",
            billing_reason: "subscription_cycle",
            customer: "cus_creator",
            period_start: 1_787_529_600,
            period_end: 1_790_208_000,
            parent: {
              subscription_details: {
                subscription: "sub_creator",
                metadata: { kind: "creator_plan", tenantId: "t1", plan: "PRO" },
              },
            },
          },
        },
      });
      prisma.subscription.findUnique.mockResolvedValue(null);

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.refillCreatorPlanFromPaidInvoice).toHaveBeenCalledWith({
        tenantId: "t1",
        plan: "PRO",
        stripeSubscriptionId: "sub_creator",
        stripeInvoiceId: "in_renewal",
        stripeCustomerId: "cus_creator",
        periodStart: new Date(1_787_529_600_000),
        periodEnd: new Date(1_790_208_000_000),
      });
    });

    it("does not resurrect a remotely canceled creator subscription from delayed invoice.paid", async () => {
      mocks.subscriptionRetrieve.mockResolvedValue({
        id: "sub_creator",
        status: "canceled",
        metadata: { kind: "creator_plan", tenantId: "t1", plan: "PRO" },
      });
      constructWebhookEvent.mockReturnValue({
        id: "evt_delayed_paid",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_old",
            billing_reason: "subscription_cycle",
            period_start: 1_787_529_600,
            period_end: 1_790_208_000,
            parent: {
              subscription_details: {
                subscription: "sub_creator",
                metadata: { kind: "creator_plan", tenantId: "t1", plan: "PRO" },
              },
            },
          },
        },
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.refillCreatorPlanFromPaidInvoice).not.toHaveBeenCalled();
      expect(mocks.updateCreatorSubscription).not.toHaveBeenCalled();
    });

    it("cancels and refunds an invoice-paid creator subscription after tenant deletion", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_orphan_invoice",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_orphan",
            billing_reason: "subscription_create",
            customer: "cus_orphan",
            period_start: 1_787_529_600,
            period_end: 1_790_208_000,
            parent: {
              subscription_details: {
                subscription: "sub_orphan",
                metadata: {
                  kind: "creator_plan",
                  tenantId: "deleted_tenant",
                  plan: "PRO",
                },
              },
            },
          },
        },
      });
      prisma.tenant.findUnique.mockResolvedValue(null);

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.cancelAndRefundOrphanCreatorSubscription).toHaveBeenCalledWith({
        stripeSubscriptionId: "sub_orphan",
        stripeInvoiceId: "in_orphan",
      });
      expect(mocks.refillCreatorPlanFromPaidInvoice).not.toHaveBeenCalled();
    });

    it("does not grant a second allowance for a paid proration invoice", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_invoice_proration",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_proration",
            billing_reason: "subscription_update",
            customer: "cus_creator",
            period_start: 1_787_529_600,
            period_end: 1_790_208_000,
            parent: {
              subscription_details: {
                subscription: "sub_creator",
                metadata: { kind: "creator_plan", tenantId: "t1", plan: "PRO" },
              },
            },
          },
        },
      });
      prisma.subscription.findUnique.mockResolvedValue(null);

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.refillCreatorPlanFromPaidInvoice).not.toHaveBeenCalled();
      expect(mocks.updateCreatorSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ACTIVE" }),
      );
    });
  });

  describe("charge.refunded", () => {
    function refundedCharge(overrides: Record<string, unknown> = {}) {
      return {
        id: "evt_refund",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_1",
            refunded: true,
            payment_intent: "pi_refunded",
            metadata: { tenantId: "t1" },
            ...overrides,
          },
        },
      };
    }

    it("marks the order refunded and revokes all purchase-side benefits", async () => {
      constructWebhookEvent.mockReturnValue(refundedCharge());
      prisma.order.findFirst.mockResolvedValue({
        id: "order_1",
        tenantId: "t1",
        userId: "u1",
        stripeSessionId: "cs_order",
        grantedEntitlementKey: "product:ebook",
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.reverseDestinationTransferForRefunds).toHaveBeenCalled();
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order_1", refundedAt: null },
          data: expect.objectContaining({ status: "REFUNDED", refundedAt: expect.any(Date) }),
        }),
      );
      expect(prisma.entitlement.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ key: "product:ebook", source: "PURCHASE" }),
        }),
      );
      expect(mocks.reversePointsByReference).toHaveBeenCalledWith(
        expect.objectContaining({ refId: "cs_order", reversalRefId: "evt_refund" }),
      );
      expect(mocks.reverseReferralPurchase).toHaveBeenCalledWith({
        tenantId: "t1",
        stripeSessionId: "cs_order",
      });
      expect(mocks.refundPaidCreditPack).toHaveBeenCalledWith({
        tenantId: "t1",
        stripePaymentIntentId: "pi_refunded",
      });
    });

    it("marks a refunded tip and reverses Tip-reference points", async () => {
      constructWebhookEvent.mockReturnValue(refundedCharge());
      prisma.order.findFirst.mockResolvedValue({
        id: "order_tip",
        tenantId: "t1",
        userId: "u1",
        description: "Trinkgeld",
        stripeSessionId: "cs_tip",
        grantedEntitlementKey: null,
      });
      mocks.checkoutSessionRetrieve.mockResolvedValue({
        id: "cs_tip",
        metadata: { kind: "tip", tipId: "tip_1" },
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.reversePointsByReference).toHaveBeenCalledWith({
        tenantId: "t1",
        userId: "u1",
        refType: "Tip",
        refId: "tip_1",
        reversalRefId: "evt_refund",
      });
      expect(prisma.tip.updateMany).toHaveBeenCalledWith({
        where: { id: "tip_1", tenantId: "t1", status: "PAID" },
        data: { status: "REFUNDED" },
      });
    });

    it("claws back an AI credit pack even when there is no product order", async () => {
      constructWebhookEvent.mockReturnValue(refundedCharge());
      prisma.order.findFirst.mockResolvedValue(null);

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(mocks.refundPaidCreditPack).toHaveBeenCalledWith({
        tenantId: "t1",
        stripePaymentIntentId: "pi_refunded",
      });
    });

    it("suspends a subscription when its paid invoice is fully refunded", async () => {
      constructWebhookEvent.mockReturnValue(refundedCharge());
      prisma.order.findFirst.mockResolvedValue(null);
      prisma.aiCreditWallet.findFirst.mockResolvedValue({ tenantId: "t1" });
      prisma.subscription.findUnique.mockResolvedValue(null);
      mocks.getStripe.mockReturnValue({
        invoicePayments: {
          list: vi.fn().mockResolvedValue({
            data: [
              {
                invoice: {
                  id: "in_refunded",
                  parent: {
                    subscription_details: { subscription: "sub_refunded", metadata: {} },
                  },
                },
              },
            ],
          }),
        },
        invoices: { retrieve: vi.fn() },
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.updateCreatorSubscription).toHaveBeenCalledWith({
        tenantId: "t1",
        stripeSubscriptionId: "sub_refunded",
        status: "PAST_DUE",
      });
    });

    it("restocks a physical product exactly on the first refund", async () => {
      constructWebhookEvent.mockReturnValue(refundedCharge());
      prisma.order.findFirst.mockResolvedValue({
        id: "order_physical",
        tenantId: "t1",
        userId: "u1",
        productId: "prod1",
        refundedAt: null,
        inventoryReservedAt: new Date(),
        stripeSessionId: "cs_physical",
        grantedEntitlementKey: null,
      });
      prisma.product.findUnique.mockResolvedValue({ stock: 2 });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: "prod1" },
        data: { stock: { increment: 1 } },
      });
    });

    it("does not invent stock when an originally unlimited order is refunded", async () => {
      constructWebhookEvent.mockReturnValue(refundedCharge());
      prisma.order.findFirst.mockResolvedValue({
        id: "order_unlimited",
        tenantId: "t1",
        userId: "u1",
        productId: "prod1",
        refundedAt: null,
        inventoryReservedAt: null,
        stripeSessionId: "cs_unlimited",
        grantedEntitlementKey: null,
      });
      // The creator later changed the product to limited stock.
      prisma.product.findUnique.mockResolvedValue({ stock: 2 });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it("keeps access when another paid order grants the same entitlement", async () => {
      constructWebhookEvent.mockReturnValue(refundedCharge());
      prisma.order.findFirst.mockResolvedValue({
        id: "order_1",
        tenantId: "t1",
        userId: "u1",
        productId: null,
        refundedAt: null,
        stripeSessionId: "cs_order",
        grantedEntitlementKey: "product:bundle",
      });
      prisma.order.count.mockResolvedValue(1);

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.entitlement.deleteMany).not.toHaveBeenCalled();
    });

    it("does not revoke access for a partially refunded charge", async () => {
      constructWebhookEvent.mockReturnValue(
        refundedCharge({ refunded: false, amount: 5000, amount_refunded: 1000 }),
      );

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.reverseDestinationTransferForRefunds).toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(mocks.refundPaidCreditPack).not.toHaveBeenCalled();
    });
  });

  describe("customer.subscription.deleted", () => {
    it("cancels the subscription, expires the entitlement and falls back to the default tier", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_3",
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_1" } },
      });
      prisma.subscription.findUnique.mockResolvedValue({
        id: "s1", tenantId: "t1", userId: "u1",
        tier: { entitlementKey: "tier:vip" },
      });
      prisma.membershipTier.findFirst.mockResolvedValue({ id: "free-tier" });

      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "CANCELED" } }),
      );
      expect(prisma.entitlement.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ key: "tier:vip" }),
          data: { expiresAt: expect.any(Date) },
        }),
      );
      expect(prisma.membership.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { tierId: "free-tier" } }),
      );
    });
  });

  describe("invoice.payment_failed", () => {
    it("reads the Stripe v19 parent subscription, marks it PAST_DUE and suspends access", async () => {
      mocks.subscriptionRetrieve.mockResolvedValue({
        id: "sub_1",
        status: "past_due",
        metadata: { tenantId: "t1" },
      });
      constructWebhookEvent.mockReturnValue({
        id: "evt_4",
        type: "invoice.payment_failed",
        data: {
          object: {
            parent: {
              subscription_details: {
                subscription: "sub_1",
                metadata: { tenantId: "t1" },
              },
            },
          },
        },
      });
      prisma.subscription.findUnique.mockResolvedValue({
        id: "s1",
        tenantId: "t1",
        userId: "u1",
        tierId: "tier1",
        tier: { entitlementKey: "tier:vip", slug: "vip" },
      });
      prisma.membershipTier.findFirst.mockResolvedValue({ id: "free-tier" });

      const res = await POST(request());
      expect(res.status).toBe(200);
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "PAST_DUE" } }),
      );
      expect(prisma.entitlement.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { expiresAt: expect.any(Date) } }),
      );
      expect(prisma.membership.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { tierId: "free-tier" } }),
      );
    });

    it("does not move a remotely canceled subscription backwards to PAST_DUE", async () => {
      mocks.subscriptionRetrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });
      constructWebhookEvent.mockReturnValue({
        id: "evt_failed_after_cancel",
        type: "invoice.payment_failed",
        data: {
          object: {
            parent: { subscription_details: { subscription: "sub_1", metadata: {} } },
          },
        },
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(mocks.updateCreatorSubscription).not.toHaveBeenCalled();
    });
  });

  describe("customer.subscription.updated", () => {
    it("maps past_due and suspends the paid membership", async () => {
      mocks.subscriptionRetrieve.mockResolvedValue({
        id: "sub_1",
        status: "past_due",
        metadata: { tenantId: "t1" },
      });
      constructWebhookEvent.mockReturnValue({
        id: "evt_sub_past_due",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", status: "past_due", metadata: { tenantId: "t1" } } },
      });
      prisma.subscription.findUnique.mockResolvedValue({
        id: "s1", tenantId: "t1", userId: "u1", tierId: "tier1",
        tier: { entitlementKey: "tier:vip", slug: "vip" },
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "PAST_DUE" }) }),
      );
    });

    it("does not regrant a locally PAST_DUE membership without invoice.paid", async () => {
      mocks.subscriptionRetrieve.mockResolvedValue({
        id: "sub_1",
        status: "active",
        metadata: {},
      });
      constructWebhookEvent.mockReturnValue({
        id: "evt_stale_active",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", status: "active", metadata: {} } },
      });
      prisma.subscription.findUnique.mockResolvedValue({
        id: "s1",
        status: "PAST_DUE",
        tenantId: "t1",
        userId: "u1",
        tierId: "tier1",
        tier: { entitlementKey: "tier:vip", slug: "vip" },
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(grantEntitlement).not.toHaveBeenCalled();
    });
  });

  describe("charge disputes", () => {
    it("reverses order benefits immediately when a dispute is created", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_dispute",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_1",
            status: "needs_response",
            payment_intent: "pi_disputed",
            metadata: { tenantId: "t1" },
          },
        },
      });
      prisma.order.findFirst.mockResolvedValue({
        id: "order_1", tenantId: "t1", userId: "u1", refundedAt: null,
        stripeSessionId: "cs_order", stripePaymentIntentId: "pi_disputed",
        grantedEntitlementKey: "product:ebook", productId: null,
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(mocks.reverseDestinationTransferForDispute).toHaveBeenCalled();
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED" }) }),
      );
      expect(mocks.reversePointsByReference).toHaveBeenCalled();
      expect(mocks.reverseReferralPurchase).toHaveBeenCalled();
      expect(mocks.refundPaidCreditPack).toHaveBeenCalledWith({
        tenantId: "t1",
        stripePaymentIntentId: "pi_disputed",
      });
    });

    it("records a won dispute without replaying financial grants", async () => {
      constructWebhookEvent.mockReturnValue({
        id: "evt_dispute_won",
        type: "charge.dispute.closed",
        data: {
          object: {
            id: "dp_1",
            status: "won",
            payment_intent: "pi_disputed",
            metadata: { tenantId: "t1" },
          },
        },
      });

      const res = await POST(request());

      expect(res.status).toBe(200);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(mocks.refundPaidCreditPack).not.toHaveBeenCalled();
    });
  });
});
