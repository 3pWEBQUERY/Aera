import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma };
});

import prismaModule from "@/lib/prisma";
const prisma = prismaModule as unknown as PrismaMock;

import { awardPoints, levelForPoints, reversePointsByReference } from "@/lib/gamification";

function rule(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    tenantId: "t1",
    name: "Beitrag erstellt",
    trigger: "POST_CREATED",
    points: 10,
    maxPerDay: null,
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults for the stats/badges refresh that follows a successful award.
  prisma.pointsLedger.aggregate.mockResolvedValue({ _sum: { points: 10 } });
  prisma.level.findFirst.mockResolvedValue(null);
  prisma.memberStats.upsert.mockResolvedValue({});
  prisma.badge.findMany.mockResolvedValue([]);
  prisma.pointsLedger.create.mockResolvedValue({});
});

describe("awardPoints", () => {
  it("returns 0 and writes nothing when no active rule matches", async () => {
    prisma.gamificationRule.findMany.mockResolvedValue([]);
    const total = await awardPoints({ tenantId: "t1", userId: "u1", trigger: "POST_CREATED" });
    expect(total).toBe(0);
    expect(prisma.pointsLedger.create).not.toHaveBeenCalled();
    expect(prisma.memberStats.upsert).not.toHaveBeenCalled();
  });

  it("awards rule points and refreshes aggregated stats", async () => {
    prisma.gamificationRule.findMany.mockResolvedValue([rule()]);
    const total = await awardPoints({
      tenantId: "t1",
      userId: "u1",
      trigger: "POST_CREATED",
      refType: "Post",
      refId: "p1",
    });
    expect(total).toBe(10);
    expect(prisma.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          points: 10,
          refType: "Post",
          refId: "p1",
          dedupeKey: "t1:u1:r1:Post:p1",
        }),
      }),
    );
    expect(prisma.memberStats.upsert).toHaveBeenCalled();
  });

  it("skips rules whose per-day cap is exhausted", async () => {
    prisma.gamificationRule.findMany.mockResolvedValue([rule({ maxPerDay: 3 })]);
    prisma.pointsLedger.count.mockResolvedValue(3); // already at the cap
    const total = await awardPoints({ tenantId: "t1", userId: "u1", trigger: "POST_CREATED" });
    expect(total).toBe(0);
    expect(prisma.pointsLedger.create).not.toHaveBeenCalled();
  });

  it("still awards below the per-day cap", async () => {
    prisma.gamificationRule.findMany.mockResolvedValue([rule({ maxPerDay: 3 })]);
    prisma.pointsLedger.count.mockResolvedValue(2);
    const total = await awardPoints({ tenantId: "t1", userId: "u1", trigger: "POST_CREATED" });
    expect(total).toBe(10);
  });

  it("stacks multiple active rules for the same trigger", async () => {
    prisma.gamificationRule.findMany.mockResolvedValue([
      rule(),
      rule({ id: "r2", name: "Bonus", points: 5 }),
    ]);
    const total = await awardPoints({ tenantId: "t1", userId: "u1", trigger: "POST_CREATED" });
    expect(total).toBe(15);
    expect(prisma.pointsLedger.create).toHaveBeenCalledTimes(2);
  });

  it("ignores zero-point rules", async () => {
    prisma.gamificationRule.findMany.mockResolvedValue([rule({ points: 0 })]);
    const total = await awardPoints({ tenantId: "t1", userId: "u1", trigger: "POST_CREATED" });
    expect(total).toBe(0);
    expect(prisma.pointsLedger.create).not.toHaveBeenCalled();
  });

  it("treats a repeated referenced award as an idempotent no-op", async () => {
    prisma.gamificationRule.findMany.mockResolvedValue([rule()]);
    prisma.pointsLedger.create.mockRejectedValueOnce({ code: "P2002" });

    const total = await awardPoints({
      tenantId: "t1",
      userId: "u1",
      trigger: "PURCHASE",
      refType: "StripeSession",
      refId: "cs_1",
    });

    expect(total).toBe(0);
    expect(prisma.memberStats.upsert).not.toHaveBeenCalled();
  });

  it("awards badges whose threshold is met (duplicates are ignored)", async () => {
    prisma.gamificationRule.findMany.mockResolvedValue([rule()]);
    prisma.badge.findMany.mockResolvedValue([
      { id: "b1", tenantId: "t1", criteria: { type: "points", threshold: 10 } },
      { id: "b2", tenantId: "t1", criteria: { type: "points", threshold: 999 } },
    ]);
    prisma.memberStats.findUnique.mockResolvedValue({ points: 10 });
    prisma.post.count.mockResolvedValue(1);
    prisma.comment.count.mockResolvedValue(0);
    prisma.badgeAward.create.mockResolvedValue({});

    await awardPoints({ tenantId: "t1", userId: "u1", trigger: "POST_CREATED" });

    expect(prisma.badgeAward.create).toHaveBeenCalledTimes(1);
    expect(prisma.badgeAward.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ badgeId: "b1" }),
      }),
    );
  });
});

describe("levelForPoints", () => {
  it("resolves the highest level at or below the point total", async () => {
    prisma.level.findFirst.mockResolvedValue({ name: "Gold", minPoints: 100 });
    const name = await levelForPoints("t1", 150);
    expect(name).toBe("Gold");
    expect(prisma.level.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", minPoints: { lte: 150 } },
        orderBy: { minPoints: "desc" },
      }),
    );
  });

  it("returns null when no level is configured", async () => {
    prisma.level.findFirst.mockResolvedValue(null);
    expect(await levelForPoints("t1", 5)).toBeNull();
  });
});

describe("reversePointsByReference", () => {
  it("appends an idempotent negative ledger entry instead of deleting history", async () => {
    prisma.pointsLedger.findMany.mockResolvedValue([
      {
        id: "ledger_1",
        points: 10,
        reason: "Kauf",
        dedupeKey: "t1:u1:r1:StripeSession:cs_1",
      },
    ]);

    const reversed = await reversePointsByReference({
      tenantId: "t1",
      userId: "u1",
      refType: "StripeSession",
      refId: "cs_1",
      reversalRefId: "evt_refund",
    });

    expect(reversed).toBe(10);
    expect(prisma.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          points: -10,
          refType: "StripeRefund",
          refId: "evt_refund",
          dedupeKey: "reversal:t1:u1:r1:StripeSession:cs_1",
        }),
      }),
    );
    expect(prisma.memberStats.upsert).toHaveBeenCalled();
  });

  it("does not duplicate a reversal on a Stripe retry", async () => {
    prisma.pointsLedger.findMany.mockResolvedValue([
      { id: "ledger_1", points: 10, reason: "Kauf", dedupeKey: "purchase_1" },
    ]);
    prisma.pointsLedger.create.mockRejectedValueOnce({ code: "P2002" });

    const reversed = await reversePointsByReference({
      tenantId: "t1",
      userId: "u1",
      refType: "StripeSession",
      refId: "cs_1",
      reversalRefId: "evt_refund",
    });

    expect(reversed).toBe(0);
    expect(prisma.memberStats.upsert).not.toHaveBeenCalled();
  });
});
