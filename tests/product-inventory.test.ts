import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    withTenantContext: (_tenantId: string, fn: () => unknown) => fn(),
    withTenantTransaction: (fn: (tx: typeof prisma) => unknown) => fn(prisma),
  };
});

import prismaModule from "@/lib/prisma";
import {
  ProductOutOfStockError,
  releaseExpiredProductReservations,
  releaseProductOrderReservation,
  reserveProductOrder,
  settleProductOrderReservation,
} from "@/lib/product-inventory";

const prisma = prismaModule as unknown as PrismaMock;
const product = {
  id: "prod1",
  tenantId: "t1",
  name: "Limited shirt",
  priceCents: 5000,
  currency: "eur",
  stock: 1,
  requiresShipping: true,
  freeShipping: false,
  shippingCents: 500,
  grantsEntitlementKey: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.order.findMany.mockResolvedValue([]);
  prisma.order.findFirst.mockResolvedValue(null);
  prisma.product.updateMany.mockResolvedValue({ count: 1 });
  prisma.order.create.mockResolvedValue({ id: "ord1" });
});

describe("product inventory reservation", () => {
  it("claims limited stock and creates a durable pending order atomically", async () => {
    const now = new Date("2026-07-18T10:00:00.000Z");
    const result = await reserveProductOrder({
      tenantId: "t1",
      userId: "u1",
      product,
      platformFeeCents: 250,
      now,
    });

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: "prod1",
        tenantId: "t1",
        isPublished: true,
        stock: { gt: 0 },
      },
      data: { stock: { decrement: 1 } },
    });
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          amountCents: 5500,
          inventoryReservedAt: now,
          inventoryReservationExpiresAt: result.expiresAt,
        }),
      }),
    );
  });

  it("fails closed when no stock can be claimed", async () => {
    prisma.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      reserveProductOrder({
        tenantId: "t1",
        userId: "u1",
        product,
        platformFeeCents: 250,
      }),
    ).rejects.toBeInstanceOf(ProductOutOfStockError);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it("locks and re-checks an unlimited product before creating its order", async () => {
    await reserveProductOrder({
      tenantId: "t1",
      userId: "u1",
      product: { ...product, stock: null },
      platformFeeCents: 250,
    });

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: "prod1",
        tenantId: "t1",
        isPublished: true,
      },
      data: { isPublished: true },
    });
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inventoryReservedAt: null }),
      }),
    );
  });

  it("reuses the single-reservation boundary instead of claiming twice", async () => {
    prisma.order.findFirst.mockResolvedValueOnce({
      id: "ord_existing",
      stripeSessionId: "cs_existing",
      inventoryReservationExpiresAt: new Date("2026-07-18T10:31:00.000Z"),
    });

    await expect(
      reserveProductOrder({
        tenantId: "t1",
        userId: "u1",
        product,
        platformFeeCents: 250,
      }),
    ).rejects.toMatchObject({
      orderId: "ord_existing",
      stripeSessionId: "cs_existing",
    });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("turns a concurrent unique-index loser into the committed reservation", async () => {
    prisma.order.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "ord_winner",
        stripeSessionId: "cs_winner",
        inventoryReservationExpiresAt: new Date("2026-07-18T10:31:00.000Z"),
      });
    prisma.order.create.mockRejectedValue({ code: "P2002" });

    await expect(
      reserveProductOrder({
        tenantId: "t1",
        userId: "u1",
        product,
        platformFeeCents: 250,
      }),
    ).rejects.toMatchObject({
      orderId: "ord_winner",
      stripeSessionId: "cs_winner",
    });
  });

  it("reclaims stale units product-wide before the next buyer claims stock", async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: "ord_stale_other_user",
        productId: "prod1",
        inventoryReservedAt: new Date("2026-07-18T08:00:00.000Z"),
      },
    ]);
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    prisma.product.update.mockResolvedValue({});

    await reserveProductOrder({
      tenantId: "t1",
      userId: "new_buyer",
      product: { ...product, stock: 0 },
      platformFeeCents: 250,
      now: new Date("2026-07-18T12:00:00.000Z"),
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          productId: "prod1",
          inventoryReservationExpiresAt: { lte: expect.any(Date) },
        }),
      }),
    );
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: "prod1" },
      data: { stock: { increment: 1 } },
    });
    expect(prisma.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { decrement: 1 } } }),
    );
  });

  it("releases stock exactly once for a failed or expired checkout", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: "ord1",
      status: "PENDING",
      productId: "prod1",
      inventoryReservedAt: new Date(),
      inventoryReleasedAt: null,
    });
    prisma.order.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.product.update.mockResolvedValue({});

    await expect(releaseProductOrderReservation("ord1")).resolves.toBe(true);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: "prod1" },
      data: { stock: { increment: 1 } },
    });

    prisma.order.findUnique.mockResolvedValue({
      id: "ord1",
      status: "FAILED",
      productId: "prod1",
      inventoryReservedAt: new Date(),
      inventoryReleasedAt: new Date(),
    });
    await expect(releaseProductOrderReservation("ord1")).resolves.toBe(false);
    expect(prisma.product.update).toHaveBeenCalledTimes(1);
  });

  it("does not let an old Session release a reservation attached to another Session", async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: "ord1",
      status: "PENDING",
      productId: "prod1",
      inventoryReservedAt: new Date(),
      inventoryReleasedAt: null,
      stripeSessionId: "cs_current",
    });

    await expect(
      releaseProductOrderReservation("ord1", new Date(), "cs_old"),
    ).resolves.toBe(false);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("settles a reserved order without decrementing inventory again", async () => {
    prisma.order.findFirst.mockResolvedValue({ status: "PENDING", inventoryReleasedAt: null });
    prisma.order.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      settleProductOrderReservation({
        orderId: "ord1",
        tenantId: "t1",
        userId: "u1",
        productId: "prod1",
        stripeSessionId: "cs_1",
        stripePaymentIntentId: "pi_1",
        amountCents: 5500,
        currency: "eur",
        shippingCents: 500,
      }),
    ).resolves.toBe("settled");
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) }),
    );
  });

  it("recognizes a concurrent settlement of the same Stripe Session", async () => {
    prisma.order.findFirst
      .mockResolvedValueOnce({
        status: "PENDING",
        inventoryReleasedAt: null,
        stripeSessionId: "cs_1",
        stripePaymentIntentId: "pi_1",
      })
      .mockResolvedValueOnce({ id: "ord1" });
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      settleProductOrderReservation({
        orderId: "ord1",
        tenantId: "t1",
        userId: "u1",
        productId: "prod1",
        stripeSessionId: "cs_1",
        stripePaymentIntentId: "pi_1",
        amountCents: 5500,
        currency: "eur",
        shippingCents: 500,
      }),
    ).resolves.toBe("paid");

    expect(prisma.order.findFirst).toHaveBeenLastCalledWith({
      where: {
        id: "ord1",
        tenantId: "t1",
        userId: "u1",
        productId: "prod1",
        status: "PAID",
        stripeSessionId: "cs_1",
      },
      select: { id: true },
    });
  });

  it("rejects a second paid Session for an already attached order", async () => {
    prisma.order.findFirst.mockResolvedValue({
      status: "PAID",
      inventoryReleasedAt: null,
      stripeSessionId: "cs_original",
      stripePaymentIntentId: "pi_original",
    });

    await expect(
      settleProductOrderReservation({
        orderId: "ord1",
        tenantId: "t1",
        userId: "u1",
        productId: "prod1",
        stripeSessionId: "cs_second",
        stripePaymentIntentId: "pi_second",
        amountCents: 5500,
        currency: "eur",
        shippingCents: 500,
      }),
    ).resolves.toBe("unavailable");
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("sweeps stale reservations across tenants when an expiry webhook was lost", async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: "ord_stale", tenantId: "t1", stripeSessionId: "cs_stale" },
    ]);
    prisma.order.findUnique.mockResolvedValue({
      id: "ord_stale",
      status: "PENDING",
      productId: "prod1",
      inventoryReservedAt: new Date(),
      inventoryReleasedAt: null,
      stripeSessionId: "cs_stale",
    });
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    prisma.product.update.mockResolvedValue({});

    await expect(
      releaseExpiredProductReservations(200, new Date("2026-07-18T14:00:00.000Z")),
    ).resolves.toEqual({ scanned: 1, released: 1 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: "prod1" },
      data: { stock: { increment: 1 } },
    });
  });
});
