import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import prisma, { withTenantContext, withTenantTransaction } from "@/lib/prisma";

export const PRODUCT_CHECKOUT_RESERVATION_MS = 65 * 60 * 1000;
// Stripe normally emits checkout.session.expired immediately. The extra grace
// protects a successful payment whose webhook was delayed during an outage;
// only clearly abandoned reservations are reclaimed lazily by a later buyer.
export const PRODUCT_RESERVATION_RECLAIM_GRACE_MS = 90 * 60 * 1000;

export class ProductOutOfStockError extends Error {
  constructor() {
    super("PRODUCT_OUT_OF_STOCK");
    this.name = "ProductOutOfStockError";
  }
}

export class ProductReservationActiveError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly stripeSessionId: string | null,
    public readonly expiresAt: Date | null,
  ) {
    super("PRODUCT_RESERVATION_ACTIVE");
    this.name = "ProductReservationActiveError";
  }
}

type ReservableProduct = {
  id: string;
  tenantId: string;
  name: string;
  priceCents: number;
  currency: string;
  stock: number | null;
  requiresShipping: boolean;
  freeShipping: boolean;
  shippingCents: number;
  grantsEntitlementKey: string | null;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * Atomically reserve a limited unit and create the durable pending order used
 * as the Stripe idempotency boundary. The partial DB index permits only one
 * active product checkout per member/product pair.
 */
export async function reserveProductOrder(args: {
  tenantId: string;
  userId: string;
  product: ReservableProduct;
  platformFeeCents: number;
  now?: Date;
}): Promise<{ id: string; expiresAt: Date }> {
  const now = args.now ?? new Date();
  const expiresAt = new Date(now.getTime() + PRODUCT_CHECKOUT_RESERVATION_MS);

  try {
    return await withTenantTransaction(async (tx) => {
    const staleOrders = await tx.order.findMany({
      where: {
        tenantId: args.tenantId,
        productId: args.product.id,
        status: "PENDING",
        inventoryReleasedAt: null,
        inventoryReservationExpiresAt: {
          lte: new Date(now.getTime() - PRODUCT_RESERVATION_RECLAIM_GRACE_MS),
        },
      },
      select: { id: true, productId: true, inventoryReservedAt: true },
      orderBy: { inventoryReservationExpiresAt: "asc" },
      take: 100,
    });
    let releasedUnits = 0;
    for (const stale of staleOrders) {
      const released = await tx.order.updateMany({
        where: { id: stale.id, status: "PENDING", inventoryReleasedAt: null },
        data: { status: "FAILED", inventoryReleasedAt: now },
      });
      if (released.count > 0 && stale.productId && stale.inventoryReservedAt) {
        releasedUnits += 1;
      }
    }
    if (releasedUnits > 0) {
      await tx.product.update({
        where: { id: args.product.id },
        data: { stock: { increment: releasedUnits } },
      });
    }

    const active = await tx.order.findFirst({
      where: {
        tenantId: args.tenantId,
        userId: args.userId,
        productId: args.product.id,
        status: "PENDING",
        inventoryReleasedAt: null,
      },
      select: {
        id: true,
        stripeSessionId: true,
        inventoryReservationExpiresAt: true,
      },
    });
    if (active) {
      throw new ProductReservationActiveError(
        active.id,
        active.stripeSessionId,
        active.inventoryReservationExpiresAt,
      );
    }

    const limited = args.product.stock !== null;
    // Lock and re-check the product row in the same transaction for both
    // limited and unlimited products. Otherwise an unlimited product could be
    // deleted/archived after the action's initial read but before the pending
    // order is persisted, leaving an externally payable Session without a
    // fulfillable local resource.
    const claimed = await tx.product.updateMany({
      where: {
        id: args.product.id,
        tenantId: args.tenantId,
        isPublished: true,
        ...(limited ? { stock: { gt: 0 } } : {}),
      },
      data: limited
        ? { stock: { decrement: 1 } }
        : { isPublished: true },
    });
    if (claimed.count === 0) throw new ProductOutOfStockError();

    const shippingCents =
      args.product.requiresShipping && !args.product.freeShipping
        ? Math.max(0, args.product.shippingCents)
        : 0;
    const order = await tx.order.create({
      data: {
        tenantId: args.tenantId,
        userId: args.userId,
        productId: args.product.id,
        description: args.product.name,
        amountCents: args.product.priceCents + shippingCents,
        currency: args.product.currency,
        platformFeeCents: args.platformFeeCents,
        shippingCents,
        status: "PENDING",
        grantedEntitlementKey: args.product.grantsEntitlementKey,
        inventoryReservedAt: limited ? now : null,
        inventoryReservationExpiresAt: expiresAt,
      },
      select: { id: true },
    });
      return { id: order.id, expiresAt };
    });
  } catch (error) {
    // Two transactions can both pass the pre-check, but the partial unique
    // index commits only one. Convert the losing transaction into the same
    // reusable reservation result instead of surfacing a database error.
    if (isUniqueViolation(error)) {
      const active = await prisma.order.findFirst({
        where: {
          tenantId: args.tenantId,
          userId: args.userId,
          productId: args.product.id,
          status: "PENDING",
          inventoryReleasedAt: null,
        },
        select: {
          id: true,
          stripeSessionId: true,
          inventoryReservationExpiresAt: true,
        },
      });
      if (active) {
        throw new ProductReservationActiveError(
          active.id,
          active.stripeSessionId,
          active.inventoryReservationExpiresAt,
        );
      }
    }
    throw error;
  }
}

/** Release a pending reservation exactly once. Safe for retries and races. */
export async function releaseProductOrderReservation(
  orderId: string,
  now = new Date(),
  expectedStripeSessionId?: string,
): Promise<boolean> {
  return withTenantTransaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        productId: true,
        inventoryReservedAt: true,
        inventoryReleasedAt: true,
        stripeSessionId: true,
      },
    });
    if (!order || order.status !== "PENDING" || order.inventoryReleasedAt) return false;
    if (
      expectedStripeSessionId &&
      order.stripeSessionId &&
      order.stripeSessionId !== expectedStripeSessionId
    ) {
      return false;
    }

    const changed = await tx.order.updateMany({
      where: {
        id: order.id,
        status: "PENDING",
        inventoryReleasedAt: null,
        ...(expectedStripeSessionId
          ? {
              OR: [
                { stripeSessionId: null },
                { stripeSessionId: expectedStripeSessionId },
              ],
            }
          : {}),
      },
      data: { status: "FAILED", inventoryReleasedAt: now },
    });
    if (changed.count === 0) return false;
    if (order.productId && order.inventoryReservedAt) {
      await tx.product.update({
        where: { id: order.productId },
        data: { stock: { increment: 1 } },
      });
    }
    return true;
  });
}

/** Global fallback for lost Stripe expiry events; intended for the cron job. */
export async function releaseExpiredProductReservations(
  limit = 100,
  now = new Date(),
  options: { deadlineAt?: number } = {},
): Promise<{ scanned: number; released: number }> {
  const stale = await prisma.order.findMany({
    where: {
      status: "PENDING",
      inventoryReleasedAt: null,
      inventoryReservationExpiresAt: {
        lte: new Date(now.getTime() - PRODUCT_RESERVATION_RECLAIM_GRACE_MS),
      },
      productId: { not: null },
    },
    select: { id: true, tenantId: true, stripeSessionId: true },
    orderBy: { inventoryReservationExpiresAt: "asc" },
    take: Math.min(500, Math.max(1, limit)),
  });
  let released = 0;
  let scanned = 0;
  for (const order of stale) {
    // Do not start another transaction when the route's execution budget is
    // depleted. Unprocessed rows remain eligible for the next minute's run.
    if (options.deadlineAt && Date.now() >= options.deadlineAt - 1_000) break;
    scanned++;
    const didRelease = await withTenantContext(order.tenantId, () =>
      releaseProductOrderReservation(
        order.id,
        now,
        order.stripeSessionId ?? undefined,
      ),
    );
    if (didRelease) released += 1;
  }
  return { scanned, released };
}

/** Attach the external Session after creation; metadata still recovers crashes. */
export async function attachProductCheckoutSession(
  orderId: string,
  stripeSessionId: string,
): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING", inventoryReleasedAt: null },
    data: { stripeSessionId },
  });
}

/** Convert a pre-checkout reservation into a paid order without touching stock again. */
export async function settleProductOrderReservation(args: {
  orderId: string;
  tenantId: string;
  userId: string;
  productId: string;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  amountCents: number;
  currency: string;
  shippingCents: number;
  shippingDetails?: Prisma.InputJsonValue;
}): Promise<"settled" | "paid" | "unavailable"> {
  return withTenantTransaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id: args.orderId,
        tenantId: args.tenantId,
        userId: args.userId,
        productId: args.productId,
      },
      select: {
        status: true,
        inventoryReleasedAt: true,
        stripeSessionId: true,
        stripePaymentIntentId: true,
      },
    });
    if (!order) return "unavailable";
    const sessionMatches =
      !order.stripeSessionId || order.stripeSessionId === args.stripeSessionId;
    const paymentMatches =
      !order.stripePaymentIntentId ||
      !args.stripePaymentIntentId ||
      order.stripePaymentIntentId === args.stripePaymentIntentId;
    if (!sessionMatches || !paymentMatches) return "unavailable";
    if (order.status === "PAID") return "paid";
    if (order.status !== "PENDING" || order.inventoryReleasedAt) return "unavailable";

    const changed = await tx.order.updateMany({
      where: {
        id: args.orderId,
        status: "PENDING",
        inventoryReleasedAt: null,
        OR: [
          { stripeSessionId: null },
          { stripeSessionId: args.stripeSessionId },
        ],
      },
      data: {
        status: "PAID",
        stripeSessionId: args.stripeSessionId,
        stripePaymentIntentId: args.stripePaymentIntentId,
        amountCents: args.amountCents,
        currency: args.currency,
        shippingCents: args.shippingCents,
        shippingDetails: args.shippingDetails,
      },
    });
    if (changed.count > 0) return "settled";

    // checkout.session.completed and async_payment_succeeded are distinct
    // Stripe events and may race. If the other transaction settled this exact
    // Session while we waited on the row lock, the payment is fulfilled — it
    // must never be mistaken for an unavailable reservation and auto-refunded.
    const concurrentlySettled = await tx.order.findFirst({
      where: {
        id: args.orderId,
        tenantId: args.tenantId,
        userId: args.userId,
        productId: args.productId,
        status: "PAID",
        stripeSessionId: args.stripeSessionId,
      },
      select: { id: true },
    });
    return concurrentlySettled ? "paid" : "unavailable";
  });
}
