import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma, systemPrisma: prisma };
});

import prismaModule from "@/lib/prisma";
import {
  cronCounters,
  runCronJob,
  sanitizeCronError,
} from "@/lib/cron-monitor";

const prisma = prismaModule as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.cronJobHeartbeat.create.mockResolvedValue({});
  prisma.cronJobHeartbeat.updateMany.mockResolvedValue({ count: 1 });
});

describe("cron heartbeat monitoring", () => {
  it("persists a successful run with bounded numeric counters", async () => {
    const execution = await runCronJob("posts", async ({ deadlineAt }) => ({
      published: 3,
      deadlineAt,
      label: "ignored",
      invalid: Number.NaN,
    }));

    expect(execution.executed).toBe(true);
    expect(prisma.cronJobHeartbeat.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        job: "posts",
        status: "RUNNING",
        runToken: expect.any(String),
        leaseUntil: expect.any(Date),
        totalRuns: 1,
      }),
    });
    expect(prisma.cronJobHeartbeat.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ job: "posts", status: "RUNNING" }),
        data: expect.objectContaining({
          status: "SUCCEEDED",
          lastCounters: expect.objectContaining({ published: 3 }),
          totalSucceeded: { increment: 1 },
          runToken: null,
        }),
      }),
    );
    const data = prisma.cronJobHeartbeat.updateMany.mock.calls.at(-1)?.[0].data;
    expect(data.lastCounters).not.toHaveProperty("label");
    expect(data.lastCounters).not.toHaveProperty("invalid");
  });

  it("skips an overlapping run while its lease is active", async () => {
    prisma.cronJobHeartbeat.create.mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: "P2002" }),
    );
    prisma.cronJobHeartbeat.updateMany.mockResolvedValueOnce({ count: 0 });
    const handler = vi.fn(async () => ({ cleaned: 1 }));

    const execution = await runCronJob("uploads", handler);

    expect(execution).toEqual({ executed: false, reason: "already-running" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("takes over an expired lease using an atomic conditional update", async () => {
    prisma.cronJobHeartbeat.create.mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: "P2002" }),
    );
    prisma.cronJobHeartbeat.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await runCronJob("inventory", async () => ({ released: 2 }));

    expect(prisma.cronJobHeartbeat.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          job: "inventory",
          OR: expect.arrayContaining([{ leaseUntil: null }]),
        }),
        data: expect.objectContaining({ totalRuns: { increment: 1 } }),
      }),
    );
  });

  it("records only a sanitized failure message and rethrows", async () => {
    const secret = "cron-monitor-test-secret-token-for-redaction-check";
    await expect(
      runCronJob("webhooks", async () => {
        throw new Error(
          `POST https://user:pass@example.com/hook?token=${secret} failed for person@example.com`,
        );
      }),
    ).rejects.toThrow("POST https://");

    const failed = prisma.cronJobHeartbeat.updateMany.mock.calls.at(-1)?.[0].data;
    expect(failed.status).toBe("FAILED");
    expect(failed.totalFailed).toEqual({ increment: 1 });
    expect(failed.lastError).not.toContain(secret);
    expect(failed.lastError).not.toContain("user:pass");
    expect(failed.lastError).not.toContain("person@example.com");
    expect(failed.lastError).not.toContain("?token=");
  });
});

describe("cron diagnostic sanitizers", () => {
  it("drops non-numeric counters", () => {
    expect(cronCounters({ sent: 2, ok: true, error: "secret" })).toEqual({ sent: 2 });
  });

  it("never stores stacks or URL query strings", () => {
    const message = sanitizeCronError(
      new Error("https://example.com/path?api_key=abcdefghijklmnopqrstuvwxyz0123456789"),
    );
    expect(message).toBe("https://example.com/path");
  });
});
