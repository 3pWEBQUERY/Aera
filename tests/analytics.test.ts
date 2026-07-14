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

import { getAnalyticsSummary } from "@/lib/analytics";

function sub(interval: "MONTH" | "YEAR", priceCents: number) {
  return { tier: { interval, priceCents } };
}

/** Setzt alle von getAnalyticsSummary genutzten Queries auf leere Defaults. */
function mockDefaults() {
  prisma.subscription.findMany.mockResolvedValue([]);
  prisma.subscription.count.mockResolvedValue(0);
  prisma.order.findMany.mockResolvedValue([]);
  prisma.membership.count.mockResolvedValue(0);
  prisma.membership.findMany.mockResolvedValue([]);
  prisma.post.count.mockResolvedValue(0);
  prisma.comment.count.mockResolvedValue(0);
  prisma.reaction.count.mockResolvedValue(0);
  prisma.course.findMany.mockResolvedValue([]);
  prisma.newsletterCampaign.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDefaults();
});

describe("getAnalyticsSummary", () => {
  it("computes MRR: monthly full, yearly pro-rated", async () => {
    prisma.subscription.findMany.mockResolvedValue([
      sub("MONTH", 1000), // 10 €
      sub("MONTH", 500), //  5 €
      sub("YEAR", 12000), // 120 €/Jahr -> 10 €/Monat
    ]);

    const a = await getAnalyticsSummary("t1");
    expect(a.mrrCents).toBe(1000 + 500 + 1000);
    expect(a.activeSubscriptions).toBe(3);
  });

  it("computes churn as canceled / (active + canceled)", async () => {
    prisma.subscription.findMany.mockResolvedValue([
      sub("MONTH", 1000),
      sub("MONTH", 1000),
      sub("MONTH", 1000),
    ]);
    prisma.subscription.count.mockResolvedValue(1); // 1 Kündigung in 30 Tagen

    const a = await getAnalyticsSummary("t1");
    expect(a.churnRate30d).toBe(25); // 1 / (3 + 1)
  });

  it("is all zeros on an empty tenant (no division-by-zero)", async () => {
    const a = await getAnalyticsSummary("t1");
    expect(a.mrrCents).toBe(0);
    expect(a.churnRate30d).toBe(0);
    expect(a.revenueTotalCents).toBe(0);
    expect(a.memberGrowth).toHaveLength(6);
  });

  it("splits revenue into 30-day and total windows", async () => {
    const now = Date.now();
    prisma.order.findMany.mockResolvedValue([
      { amountCents: 1000, createdAt: new Date(now - 5 * 86_400_000) },
      { amountCents: 2000, createdAt: new Date(now - 10 * 86_400_000) },
      { amountCents: 5000, createdAt: new Date(now - 90 * 86_400_000) }, // alt
    ]);

    const a = await getAnalyticsSummary("t1");
    expect(a.revenue30dCents).toBe(3000);
    expect(a.revenueTotalCents).toBe(8000);
    expect(a.orders30d).toBe(2);
  });

  it("computes course completion rates", async () => {
    prisma.course.findMany.mockResolvedValue([
      { id: "c1", title: "Kurs A", lessons: [{ id: "l1" }, { id: "l2" }] },
    ]);
    // 2 Teilnehmende: eine hat beide Lektionen, einer nur eine -> 3/4 = 75 %.
    prisma.lessonProgress.groupBy = vi.fn().mockResolvedValue([
      { userId: "u1", _count: { _all: 2 } },
      { userId: "u2", _count: { _all: 1 } },
    ]);

    const a = await getAnalyticsSummary("t1");
    expect(a.courses[0]).toMatchObject({
      students: 2,
      lessonCount: 2,
      completionRate: 75,
    });
  });

  it("aggregates newsletter events per campaign", async () => {
    prisma.newsletterCampaign.findMany.mockResolvedValue([
      {
        id: "n1",
        subject: "Hallo",
        sentAt: new Date(),
        recipientCount: 100,
        emailEvents: [
          { type: "DELIVERED" }, { type: "DELIVERED" },
          { type: "OPENED" },
          { type: "CLICKED" },
        ],
      },
    ]);

    const a = await getAnalyticsSummary("t1");
    expect(a.campaigns[0]).toMatchObject({
      recipients: 100,
      delivered: 2,
      opened: 1,
      clicked: 1,
    });
  });
});
