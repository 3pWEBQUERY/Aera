import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const state = vi.hoisted(() => ({
  secret: "cron-status-secret-0123456789-0123456789",
}));

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: state.secret } }));
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma, systemPrisma: prisma };
});

import prismaModule from "@/lib/prisma";
import { GET } from "@/app/api/cron/status/route";

const prisma = prismaModule as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
  for (const delegate of [
    prisma.post,
    prisma.newsletterCampaign,
    prisma.newsletterDelivery,
    prisma.webhookDelivery,
    prisma.automationDelivery,
    prisma.order,
    prisma.storageUploadReservation,
    prisma.dataDeletionJob,
    prisma.objectDeletionTask,
  ]) {
    delegate.count.mockResolvedValue(0);
  }
  const recent = new Date();
  prisma.cronJobHeartbeat.findMany.mockResolvedValue(
    [
      "posts",
      "newsletters",
      "webhooks",
      "automations",
      "inventory",
      "uploads",
      "lifecycle",
      "database-backup",
    ].map(
      (job) => ({
        job,
        status: "SUCCEEDED",
        lastStartedAt: recent,
        lastSucceededAt: recent,
        lastFailedAt: null,
        lastDurationMs: 10,
        lastCounters: {},
        lastError: null,
        leaseUntil: null,
        totalRuns: 1,
        totalSucceeded: 1,
        totalFailed: 0,
      }),
    ),
  );
});

describe("cron operational status", () => {
  it("does not expose heartbeats or backlog without the bearer secret", async () => {
    const response = await GET(new Request("https://aera.so/api/cron/status"));

    expect(response.status).toBe(401);
    expect(prisma.cronJobHeartbeat.findMany).not.toHaveBeenCalled();
    expect(prisma.order.count).not.toHaveBeenCalled();
  });

  it("returns healthy heartbeats and anonymous backlog counters", async () => {
    prisma.post.count.mockResolvedValue(2);
    prisma.newsletterDelivery.count.mockResolvedValue(3);
    const response = await GET(
      new Request("https://aera.so/api/cron/status", {
        headers: { authorization: `Bearer ${state.secret}` },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.jobs).toHaveLength(7);
    expect(body.backup).toEqual(
      expect.objectContaining({ job: "database-backup", stale: false }),
    );
    expect(body.backlog).toEqual(
      expect.objectContaining({
        posts: 2,
        newsletters: { scheduledCampaigns: 0, dueDeliveries: 3 },
      }),
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("signals stale or missing workers to an external monitor", async () => {
    prisma.cronJobHeartbeat.findMany.mockResolvedValue([]);
    const response = await GET(
      new Request("https://aera.so/api/cron/status", {
        headers: { authorization: `Bearer ${state.secret}` },
      }),
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ job: "posts", status: "NEVER", stale: true }),
      ]),
    );
  });
});
