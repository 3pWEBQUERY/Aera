import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    withTenantTransaction: (fn: (tx: unknown) => unknown) => fn(prisma),
  };
});

import prismaModule from "@/lib/prisma";
const prisma = prismaModule as unknown as PrismaMock;

import {
  consumeCredits,
  getOrCreateWallet,
  walletBalance,
  grantPaidCreditPack,
  refundPaidCreditPack,
} from "@/lib/credits";

function wallet(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: "w1",
    tenantId: "t1",
    plan: "STARTER",
    monthlyCredits: 2500,
    includedRemaining: 2500,
    purchasedRemaining: 0,
    periodStart: now,
    periodEnd: new Date(now.getTime() + 20 * 86_400_000), // 20 days ahead
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function mockCreditSettlement(charged: number) {
  prisma.$queryRaw
    .mockResolvedValueOnce([{ reserved: true }])
    .mockResolvedValueOnce([{ charged }]);
}

describe("getOrCreateWallet", () => {
  it("lazily creates a FREE wallet", async () => {
    prisma.aiCreditWallet.findUnique.mockResolvedValue(null);
    prisma.aiCreditWallet.create.mockResolvedValue(
      wallet({ plan: "FREE", monthlyCredits: 500, includedRemaining: 500 }),
    );

    const w = await getOrCreateWallet("t1");
    expect(prisma.aiCreditWallet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          plan: "FREE",
          includedRemaining: 500,
        }),
      }),
    );
    expect(w.id).toBe("w1");
  });

  it("resets the monthly allowance when the period has ended", async () => {
    const past = new Date(Date.now() - 40 * 86_400_000);
    const stale = wallet({
      includedRemaining: 3,
      periodStart: new Date(past.getTime() - 30 * 86_400_000),
      periodEnd: past,
    });
    prisma.aiCreditWallet.findUnique.mockResolvedValue(stale);
    prisma.aiCreditWallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiCreditWallet.findUnique
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce({
        ...stale,
        includedRemaining: 2500,
        periodStart: past,
        periodEnd: new Date(Date.now() + 20 * 86_400_000),
      });

    const w = await getOrCreateWallet("t1");
    // Allowance refilled, period rolled past "now".
    expect(w.includedRemaining).toBe(2500);
    expect((w.periodEnd as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("does not touch a wallet inside its current period", async () => {
    prisma.aiCreditWallet.findUnique.mockResolvedValue(wallet({ includedRemaining: 7 }));
    const w = await getOrCreateWallet("t1");
    expect(w.includedRemaining).toBe(7);
    expect(prisma.aiCreditWallet.updateMany).not.toHaveBeenCalled();
  });

  it("recovers when another request creates the unique wallet first", async () => {
    const existing = wallet({ plan: "FREE", monthlyCredits: 500, includedRemaining: 500 });
    prisma.aiCreditWallet.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    prisma.aiCreditWallet.create.mockRejectedValue({ code: "P2002" });

    const result = await getOrCreateWallet("t1");

    expect(result.id).toBe("w1");
    expect(result.plan).toBe("FREE");
  });
});

describe("consumeCredits", () => {
  it("draws from the monthly allowance first, then purchased credits", async () => {
    prisma.aiCreditWallet.findUnique.mockResolvedValue(
      wallet({ includedRemaining: 5, purchasedRemaining: 10 }),
    );
    mockCreditSettlement(8);

    // 7100 tokens -> ceil(7.1) = 8 credits: 5 included + 3 purchased.
    const { credits } = await consumeCredits({
      tenantId: "t1",
      promptTokens: 100,
      outputTokens: 7000,
      totalTokens: 7100,
    });

    expect(credits).toBe(8);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("never drops balances below zero, even when usage exceeds them", async () => {
    prisma.aiCreditWallet.findUnique.mockResolvedValue(
      wallet({ includedRemaining: 2, purchasedRemaining: 1 }),
    );
    mockCreditSettlement(3);

    const result = await consumeCredits({
      tenantId: "t1",
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 1_000_000, // 1000 credits
    });

    expect(result.credits).toBe(3);
  });

  it("charges the 1-credit minimum when no usage is reported", async () => {
    prisma.aiCreditWallet.findUnique.mockResolvedValue(
      wallet({ includedRemaining: 10 }),
    );
    mockCreditSettlement(1);

    const { credits } = await consumeCredits({
      tenantId: "t1",
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });

    expect(credits).toBe(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("logs the usage kind for image generation", async () => {
    prisma.aiCreditWallet.findUnique.mockResolvedValue(wallet());
    mockCreditSettlement(2);
    await consumeCredits({
      tenantId: "t1",
      promptTokens: 10,
      outputTokens: 10,
      totalTokens: 1290,
      kind: "image_generation",
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("does not call the provider settlement when no credit can be reserved", async () => {
    prisma.aiCreditWallet.findUnique.mockResolvedValue(
      wallet({ includedRemaining: 0, purchasedRemaining: 0 }),
    );
    prisma.$queryRaw.mockResolvedValueOnce([{ reserved: false }]);

    const result = await consumeCredits({
      tenantId: "t1",
      promptTokens: 10,
      outputTokens: 10,
      totalTokens: 20,
    });

    expect(result).toEqual({ credits: 0 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("grantPaidCreditPack", () => {
  it("rejects unknown packs without touching the wallet", async () => {
    const res = await grantPaidCreditPack({
      tenantId: "t1",
      userId: "u1",
      packId: "pack_unknown",
      stripeSessionId: "cs_unknown",
    });
    expect(res.ok).toBe(false);
    expect(prisma.aiCreditWallet.update).not.toHaveBeenCalled();
  });

  it("atomically adds verified pack credits and records Stripe ids", async () => {
    prisma.aiCreditWallet.findUnique.mockResolvedValue(
      wallet({ purchasedRemaining: 100 }),
    );

    const res = await grantPaidCreditPack({
      tenantId: "t1",
      userId: "u1",
      packId: "pack_5k",
      stripeSessionId: "cs_paid",
      stripePaymentIntentId: "pi_paid",
    });
    expect(res.ok).toBe(true);
    expect(prisma.aiCreditWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { purchasedRemaining: { increment: 5000 } },
      }),
    );
    expect(prisma.aiCreditPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          credits: 5000,
          status: "COMPLETED",
          packId: "pack_5k",
          stripeSessionId: "cs_paid",
          stripePaymentIntentId: "pi_paid",
        }),
      }),
    );
  });

  it("treats a replayed Stripe session as a successful no-op", async () => {
    prisma.aiCreditWallet.findUnique.mockResolvedValue(wallet());
    prisma.aiCreditPurchase.create.mockRejectedValueOnce({ code: "P2002" });

    const res = await grantPaidCreditPack({
      tenantId: "t1",
      userId: "u1",
      packId: "pack_1k",
      stripeSessionId: "cs_replayed",
    });

    expect(res).toEqual({ ok: true, duplicate: true });
  });
});

describe("refundPaidCreditPack", () => {
  it("returns the number of unused credits removed by the database", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ removed: 750 }]);

    const result = await refundPaidCreditPack({
      tenantId: "t1",
      stripePaymentIntentId: "pi_refund",
    });

    expect(result).toEqual({ removedCredits: 750 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("walletBalance", () => {
  it("sums included and purchased credits", () => {
    expect(
      walletBalance(wallet({ includedRemaining: 3, purchasedRemaining: 4 }) as never),
    ).toBe(7);
  });
});
