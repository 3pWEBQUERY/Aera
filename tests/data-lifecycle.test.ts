import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/env", () => ({
  env: { AUTH_SECRET: "test-auth-secret-that-is-long-enough" },
  features: { storage: false },
}));
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma, systemPrisma: prisma };
});
vi.mock("@/lib/stripe-cleanup", () => ({
  assertStripeSubscriptionsInactive: vi.fn(),
  cancelStripeSubscriptionsImmediately: vi.fn(),
  deleteStripeConnectAccount: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  deleteObject: vi.fn(),
  listStoredObjectsPage: vi.fn(async () => ({
    objects: [],
    continuationToken: null,
  })),
}));

import prismaModule from "@/lib/prisma";
import {
  queueObjectDeletion,
  queueTenantDeletion,
  queueUserDeletion,
  runDataLifecycleJobs,
} from "@/lib/data-lifecycle";

const prisma = prismaModule as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.dataDeletionJob.upsert.mockResolvedValue({ id: "job-1" });
});

describe("durable data lifecycle", () => {
  it("marks a tenant DELETING in the same transaction that creates its job", async () => {
    await expect(
      queueTenantDeletion({
        tenantId: "tenant-1",
        requestedById: "owner-1",
        label: "demo",
      }),
    ).resolves.toBe("job-1");

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: { status: "DELETING" },
    });
    expect(prisma.dataDeletionJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scope_targetId: { scope: "TENANT", targetId: "tenant-1" },
        },
      }),
    );
  });

  it("revokes sessions while atomically queuing account deletion", async () => {
    await expect(
      queueUserDeletion({
        userId: "user-1",
        requestedById: "user-1",
        label: "user@example.test",
      }),
    ).resolves.toBe("job-1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { accountStatus: "DELETING", sessionVersion: { increment: 1 } },
    });
  });

  it("persists physical object deletion before the worker touches S3", async () => {
    await queueObjectDeletion({
      key: "tenants/t1/upload/object.jpg",
      tenantId: "t1",
      reason: "test",
    });

    expect(prisma.objectDeletionTask.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "tenants/t1/upload/object.jpg" },
        create: expect.objectContaining({
          key: "tenants/t1/upload/object.jpg",
          tenantId: "t1",
          reason: "test",
        }),
      }),
    );
  });

  it("resumes a leased job and advances a missing tenant to object discovery", async () => {
    const job = {
      id: "job-1",
      scope: "TENANT",
      targetId: "tenant-gone",
      requestedById: "owner",
      targetLabel: "gone",
      status: "PENDING",
      phase: "BILLING",
      attempts: 1,
      nextAttemptAt: new Date(0),
      leaseUntil: null,
      lastError: null,
      counters: {},
      objectScanCursor: null,
      objectScanComplete: false,
      completedAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    prisma.objectDeletionTask.findFirst.mockResolvedValue(null);
    prisma.dataDeletionJob.findFirst
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(null);
    prisma.dataDeletionJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.dataDeletionJob.findUnique
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce({ status: "PENDING" });
    prisma.tenant.findUnique.mockResolvedValue(null);

    const result = await runDataLifecycleJobs({ deadlineAt: Date.now() + 10_000 });

    expect(result.jobsProcessed).toBe(1);
    expect(prisma.dataDeletionJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({ phase: "OBJECT_DISCOVERY", status: "PENDING" }),
      }),
    );
  });

  it("purges expired retention and completed operational records in bounded work", async () => {
    prisma.objectDeletionTask.findFirst.mockResolvedValue(null);
    prisma.dataDeletionJob.findFirst.mockResolvedValue(null);
    prisma.$executeRaw
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);

    const result = await runDataLifecycleJobs({ deadlineAt: Date.now() + 10_000 });

    expect(result).toEqual(
      expect.objectContaining({
        billingRetentionRecordsPurged: 2,
        auditRecordsPurged: 3,
        completedObjectTasksPurged: 4,
        completedJobsPurged: 1,
      }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(4);
  });
});
