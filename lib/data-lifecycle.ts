import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { env, features } from "@/lib/env";
import { systemPrisma } from "@/lib/prisma";
import {
  assertStripeSubscriptionsInactive,
  cancelStripeSubscriptionsImmediately,
  deleteStripeConnectAccount,
} from "@/lib/stripe-cleanup";
import {
  deleteObject,
  listStoredObjectsPage,
} from "@/lib/storage";

const JOB_LEASE_MS = 3 * 60_000;
const OBJECT_LEASE_MS = 2 * 60_000;
const RETENTION_PAGE_SIZE = 250;
const DISCOVERY_PAGE_SIZE = 500;
const MAX_FAILURES = 12;
const BILLING_RETENTION_YEARS = 10;
const AUDIT_RETENTION_YEARS = 2;
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60_000;
const COMPLETED_OBJECT_TASK_RETENTION_DAYS = 30;
const COMPLETED_JOB_RETENTION_DAYS = 90;
const PURGE_PAGE_SIZE = 500;

type DeletionScope = "TENANT" | "USER";
type Counters = Record<string, string | number | boolean>;

type ClaimedJob = Awaited<ReturnType<typeof claimDeletionJob>>;

interface FinancialRow {
  source: string;
  sourceId: string;
  tenantId: string;
  subjectId: string | null;
  createdAt: Date;
  payload: Prisma.JsonValue;
}

export interface LifecycleRunResult {
  jobsProcessed: number;
  jobsCompleted: number;
  jobsRetried: number;
  objectsDeleted: number;
  objectFailures: number;
  orphanObjectsQueued: number;
  billingRetentionRecordsPurged: number;
  auditRecordsPurged: number;
  completedObjectTasksPurged: number;
  completedJobsPurged: number;
}

function scopeHash(value: string): string {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`aera:data-lifecycle:v1:${value}`)
    .digest("hex");
}

function retentionUntil(createdAt: Date, years: number): Date {
  const result = new Date(createdAt);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

function countersFrom(value: unknown): Counters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Counters = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      result[key] = item;
    }
  }
  return result;
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b[A-Za-z0-9_./+=-]{32,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || "Lifecycle step failed";
}

function retryAt(attempts: number): Date {
  const seconds = Math.min(6 * 60 * 60, 30 * 2 ** Math.min(attempts, 9));
  return new Date(Date.now() + seconds * 1_000);
}

export async function queueTenantDeletion(input: {
  tenantId: string;
  requestedById: string;
  label: string;
}): Promise<string> {
  return systemPrisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: input.tenantId },
      data: { status: "DELETING" },
    });
    const job = await tx.dataDeletionJob.upsert({
      where: {
        scope_targetId: { scope: "TENANT", targetId: input.tenantId },
      },
      create: {
        scope: "TENANT",
        targetId: input.tenantId,
        requestedById: input.requestedById,
        targetLabel: input.label,
      },
      update: {
        requestedById: input.requestedById,
        targetLabel: input.label,
        status: "PENDING",
        phase: "BILLING",
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseUntil: null,
        lastError: null,
        counters: {},
        objectScanCursor: null,
        objectScanComplete: false,
        completedAt: null,
      },
      select: { id: true },
    });
    // The fallback is only relevant to lightweight test doubles; Prisma always
    // returns the selected id in production.
    return job?.id ?? `tenant:${input.tenantId}`;
  });
}

export async function queueUserDeletion(input: {
  userId: string;
  requestedById: string;
  label: string;
}): Promise<string> {
  return systemPrisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { accountStatus: "DELETING", sessionVersion: { increment: 1 } },
    });
    const job = await tx.dataDeletionJob.upsert({
      where: { scope_targetId: { scope: "USER", targetId: input.userId } },
      create: {
        scope: "USER",
        targetId: input.userId,
        requestedById: input.requestedById,
        targetLabel: input.label,
      },
      update: {
        requestedById: input.requestedById,
        targetLabel: input.label,
        status: "PENDING",
        phase: "BILLING",
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseUntil: null,
        lastError: null,
        counters: {},
        objectScanCursor: null,
        objectScanComplete: false,
        completedAt: null,
      },
      select: { id: true },
    });
    return job?.id ?? `user:${input.userId}`;
  });
}

/** Durable delete intent used before a StorageObject row becomes unreachable. */
export async function queueObjectDeletion(input: {
  key: string;
  tenantId?: string | null;
  jobId?: string | null;
  reason: string;
}): Promise<void> {
  await systemPrisma.objectDeletionTask.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      tenantId: input.tenantId ?? null,
      jobId: input.jobId ?? null,
      reason: input.reason,
    },
    update: {
      tenantId: input.tenantId ?? undefined,
      jobId: input.jobId ?? undefined,
      reason: input.reason,
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      lastError: null,
      completedAt: null,
    },
  });
}

async function claimDeletionJob() {
  const now = new Date();
  const candidate = await systemPrisma.dataDeletionJob.findFirst({
    where: {
      status: { in: ["PENDING", "RETRYING", "PROCESSING"] },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;
  const claimed = await systemPrisma.dataDeletionJob.updateMany({
    where: {
      id: candidate.id,
      status: { in: ["PENDING", "RETRYING", "PROCESSING"] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      leaseUntil: new Date(now.getTime() + JOB_LEASE_MS),
    },
  });
  if (claimed.count !== 1) return null;
  return systemPrisma.dataDeletionJob.findUnique({ where: { id: candidate.id } });
}

async function transitionJob(
  jobId: string,
  phase: string,
  data: {
    counters?: Counters;
    objectScanCursor?: string | null;
    objectScanComplete?: boolean;
  } = {},
): Promise<void> {
  await systemPrisma.dataDeletionJob.update({
    where: { id: jobId },
    data: {
      phase,
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      lastError: null,
      ...(data.counters ? { counters: data.counters } : {}),
      ...(data.objectScanCursor !== undefined
        ? { objectScanCursor: data.objectScanCursor }
        : {}),
      ...(data.objectScanComplete !== undefined
        ? { objectScanComplete: data.objectScanComplete }
        : {}),
    },
  });
}

async function retryJob(job: NonNullable<ClaimedJob>, error: unknown): Promise<void> {
  const exhausted = job.attempts >= MAX_FAILURES;
  await systemPrisma.dataDeletionJob.update({
    where: { id: job.id },
    data: {
      status: exhausted ? "BLOCKED" : "RETRYING",
      nextAttemptAt: retryAt(job.attempts),
      leaseUntil: null,
      lastError: safeError(error),
    },
  });
}

async function processBilling(job: NonNullable<ClaimedJob>): Promise<void> {
  if (job.scope === "TENANT") {
    const tenant = await systemPrisma.tenant.findUnique({
      where: { id: job.targetId },
      select: { id: true, stripeAccountId: true },
    });
    if (!tenant) {
      await transitionJob(job.id, "OBJECT_DISCOVERY");
      return;
    }
    const [subscriptions, wallet, pendingOrders, pendingBookings, openCheckouts] =
      await Promise.all([
        systemPrisma.subscription.findMany({
          where: { tenantId: tenant.id, stripeSubscriptionId: { not: null } },
          select: { stripeSubscriptionId: true },
        }),
        systemPrisma.aiCreditWallet.findUnique({
          where: { tenantId: tenant.id },
          select: { stripeSubscriptionId: true },
        }),
        systemPrisma.order.count({
          where: { tenantId: tenant.id, status: "PENDING" },
        }),
        systemPrisma.bookingReservation.count({
          where: { tenantId: tenant.id, status: "PENDING" },
        }),
        systemPrisma.pendingCreatorCheckout.count({
          where: {
            tenantId: tenant.id,
            status: { in: ["CREATING", "OPEN"] },
            expiresAt: { gt: new Date() },
          },
        }),
      ]);
    if (pendingOrders || pendingBookings || openCheckouts) {
      throw new Error("Pending payments or reservations still block tenant deletion");
    }
    await assertStripeSubscriptionsInactive([
      ...subscriptions.map((item) => item.stripeSubscriptionId),
      wallet?.stripeSubscriptionId ?? null,
    ]);
    if (tenant.stripeAccountId) {
      await deleteStripeConnectAccount(tenant.stripeAccountId);
    }
  } else {
    const user = await systemPrisma.user.findUnique({
      where: { id: job.targetId },
      select: { id: true, accountStatus: true },
    });
    if (!user) {
      await transitionJob(job.id, "OBJECT_DISCOVERY", {
        objectScanComplete: true,
      });
      return;
    }
    const [ownedTenants, subscriptions, pendingOrders, pendingBookings, openCheckouts] =
      await Promise.all([
        systemPrisma.tenant.count({ where: { ownerId: user.id } }),
        systemPrisma.subscription.findMany({
          where: { userId: user.id, stripeSubscriptionId: { not: null } },
          select: { stripeSubscriptionId: true },
        }),
        systemPrisma.order.count({ where: { userId: user.id, status: "PENDING" } }),
        systemPrisma.bookingReservation.count({
          where: { userId: user.id, status: "PENDING" },
        }),
        systemPrisma.pendingCreatorCheckout.count({
          where: {
            userId: user.id,
            status: { in: ["CREATING", "OPEN"] },
            expiresAt: { gt: new Date() },
          },
        }),
      ]);
    if (ownedTenants) throw new Error("Owned communities must be deleted first");
    if (pendingOrders || pendingBookings || openCheckouts) {
      throw new Error("Pending payments or reservations still block account deletion");
    }
    await cancelStripeSubscriptionsImmediately(
      subscriptions.map((item) => item.stripeSubscriptionId),
    );
    await systemPrisma.subscription.updateMany({
      where: { userId: user.id, status: { not: "CANCELED" } },
      data: {
        status: "CANCELED",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(),
      },
    });
  }
  await transitionJob(job.id, "RETENTION");
}

function financialSql(
  scope: DeletionScope,
  targetId: string,
  sourceCursor: string,
  idCursor: string,
) {
  const orderWhere =
    scope === "TENANT"
      ? Prisma.sql`o."tenantId" = ${targetId}`
      : Prisma.sql`o."userId" = ${targetId}`;
  const subscriptionWhere =
    scope === "TENANT"
      ? Prisma.sql`s."tenantId" = ${targetId}`
      : Prisma.sql`s."userId" = ${targetId}`;
  const tipWhere =
    scope === "TENANT"
      ? Prisma.sql`t."tenantId" = ${targetId}`
      : Prisma.sql`t."userId" = ${targetId}`;
  const bookingWhere =
    scope === "TENANT"
      ? Prisma.sql`b."tenantId" = ${targetId}`
      : Prisma.sql`b."userId" = ${targetId}`;
  const creditWhere =
    scope === "TENANT"
      ? Prisma.sql`p."tenantId" = ${targetId}`
      : Prisma.sql`p."userId" = ${targetId}`;
  const referralWhere =
    scope === "TENANT"
      ? Prisma.sql`r."tenantId" = ${targetId}`
      : Prisma.sql`(r."referrerId" = ${targetId} OR r."referredId" = ${targetId})`;

  return Prisma.sql`
    WITH financial AS (
      SELECT 'Order'::text AS source, o.id AS "sourceId", o."tenantId",
        o."userId" AS "subjectId", o."createdAt",
        jsonb_build_object(
          'description', o.description,
          'amountCents', o."amountCents",
          'currency', o.currency,
          'platformFeeCents', o."platformFeeCents",
          'shippingCents', o."shippingCents",
          'shippingDetails', o."shippingDetails",
          'status', o.status,
          'stripeSessionId', o."stripeSessionId",
          'stripePaymentIntentId', o."stripePaymentIntentId",
          'refundedAt', o."refundedAt",
          'createdAt', o."createdAt"
        ) AS payload
      FROM "Order" o WHERE ${orderWhere}
      UNION ALL
      SELECT 'Subscription', s.id, s."tenantId", s."userId", s."createdAt",
        jsonb_build_object(
          'status', s.status,
          'stripeSubscriptionId', s."stripeSubscriptionId",
          'currentPeriodEnd', s."currentPeriodEnd",
          'cancelAtPeriodEnd', s."cancelAtPeriodEnd",
          'tierName', mt.name,
          'priceCents', mt."priceCents",
          'currency', mt.currency,
          'interval', mt.interval,
          'createdAt', s."createdAt",
          'updatedAt', s."updatedAt"
        )
      FROM "Subscription" s
      JOIN "MembershipTier" mt ON mt.id = s."tierId"
      WHERE ${subscriptionWhere}
      UNION ALL
      SELECT 'Tip', t.id, t."tenantId", t."userId", t."createdAt",
        jsonb_build_object(
          'amountCents', t."amountCents", 'currency', t.currency,
          'status', t.status, 'createdAt', t."createdAt"
        )
      FROM "Tip" t WHERE ${tipWhere}
      UNION ALL
      SELECT 'BookingReservation', b.id, b."tenantId", b."userId", b."createdAt",
        jsonb_build_object(
          'status', b.status, 'stripeSessionId', b."stripeSessionId",
          'slotTitle', bs.title, 'startsAt', bs."startsAt",
          'priceCents', bs."priceCents", 'currency', bs.currency,
          'createdAt', b."createdAt"
        )
      FROM "BookingReservation" b
      JOIN "BookingSlot" bs ON bs.id = b."slotId"
      WHERE ${bookingWhere}
      UNION ALL
      SELECT 'AiCreditPurchase', p.id, p."tenantId", p."userId", p."createdAt",
        jsonb_build_object(
          'credits', p.credits, 'priceCents', p."priceCents",
          'currency', p.currency, 'status', p.status,
          'stripeSessionId', p."stripeSessionId",
          'stripePaymentIntentId', p."stripePaymentIntentId",
          'refundedAt', p."refundedAt", 'createdAt', p."createdAt"
        )
      FROM "AiCreditPurchase" p WHERE ${creditWhere}
      UNION ALL
      SELECT 'ReferralConversion', r.id, r."tenantId", r."referredId", r."createdAt",
        jsonb_build_object(
          'kind', r.kind, 'amountCents', r."amountCents",
          'commissionCents', r."commissionCents", 'refType', r."refType",
          'refId', r."refId", 'reversedAt', r."reversedAt",
          'createdAt', r."createdAt"
        )
      FROM "ReferralConversion" r WHERE ${referralWhere}
    )
    SELECT source, "sourceId", "tenantId", "subjectId", "createdAt", payload
    FROM financial
    WHERE source > ${sourceCursor}
       OR (source = ${sourceCursor} AND "sourceId" > ${idCursor})
    ORDER BY source ASC, "sourceId" ASC
    LIMIT ${RETENTION_PAGE_SIZE}
  `;
}

async function processRetention(job: NonNullable<ClaimedJob>): Promise<void> {
  const counters = countersFrom(job.counters);
  const sourceCursor = String(counters.retentionSource ?? "");
  const idCursor = String(counters.retentionId ?? "");
  const rows = await systemPrisma.$queryRaw<FinancialRow[]>(
    financialSql(job.scope, job.targetId, sourceCursor, idCursor),
  );
  if (rows.length) {
    await systemPrisma.billingRetentionRecord.createMany({
      data: rows.map((row) => ({
        source: `${job.scope}:${row.source}`,
        sourceId: row.sourceId,
        tenantScopeHash: scopeHash(row.tenantId),
        subjectHash: row.subjectId ? scopeHash(row.subjectId) : null,
        payload: row.payload as Prisma.InputJsonValue,
        retainUntil: retentionUntil(row.createdAt, BILLING_RETENTION_YEARS),
      })),
      skipDuplicates: true,
    });
  }
  if (rows.length === RETENTION_PAGE_SIZE) {
    const last = rows.at(-1)!;
    await transitionJob(job.id, "RETENTION", {
      counters: {
        ...counters,
        retentionSource: last.source,
        retentionId: last.sourceId,
        retained: Number(counters.retained ?? 0) + rows.length,
      },
    });
    return;
  }
  await transitionJob(job.id, "OBJECT_DISCOVERY", {
    counters: {
      ...counters,
      retained: Number(counters.retained ?? 0) + rows.length,
      discoverySource: "",
      discoveryId: "",
    },
  });
}

interface StorageKeyRow {
  source: string;
  sourceId: string;
  tenantId: string;
  key: string;
}

async function discoverDatabaseObjects(job: NonNullable<ClaimedJob>) {
  const counters = countersFrom(job.counters);
  if (counters.databaseDiscoveryComplete === true) {
    return { complete: true, counters };
  }
  const sourceCursor = String(counters.discoverySource ?? "");
  const idCursor = String(counters.discoveryId ?? "");
  const objectWhere =
    job.scope === "TENANT"
      ? Prisma.sql`s."tenantId" = ${job.targetId}`
      : Prisma.sql`s."ownerId" = ${job.targetId}`;
  const reservationWhere =
    job.scope === "TENANT"
      ? Prisma.sql`r."tenantId" = ${job.targetId}`
      : Prisma.sql`r."ownerId" = ${job.targetId}`;
  const rows = await systemPrisma.$queryRaw<StorageKeyRow[]>(Prisma.sql`
    WITH objects AS (
      SELECT 'StorageObject'::text AS source, s.id AS "sourceId", s."tenantId", s.key
      FROM "StorageObject" s WHERE ${objectWhere}
      UNION ALL
      SELECT 'StorageUploadReservation', r.id, r."tenantId", r.key
      FROM "StorageUploadReservation" r WHERE ${reservationWhere}
    )
    SELECT source, "sourceId", "tenantId", key FROM objects
    WHERE source > ${sourceCursor}
       OR (source = ${sourceCursor} AND "sourceId" > ${idCursor})
    ORDER BY source ASC, "sourceId" ASC
    LIMIT ${DISCOVERY_PAGE_SIZE}
  `);
  if (rows.length) {
    const keys = [...new Set(rows.map((row) => row.key))];
    await systemPrisma.objectDeletionTask.createMany({
      data: rows.map((row) => ({
        jobId: job.id,
        tenantId: row.tenantId,
        key: row.key,
        reason: `${job.scope.toLowerCase()}_deletion`,
      })),
      skipDuplicates: true,
    });
    await systemPrisma.objectDeletionTask.updateMany({
      where: { key: { in: keys } },
      data: { jobId: job.id },
    });
  }
  if (rows.length === DISCOVERY_PAGE_SIZE) {
    const last = rows.at(-1)!;
    await transitionJob(job.id, "OBJECT_DISCOVERY", {
      counters: {
        ...counters,
        discoverySource: last.source,
        discoveryId: last.sourceId,
        objectsQueued: Number(counters.objectsQueued ?? 0) + rows.length,
      },
    });
    return { complete: false, counters };
  }
  return {
    complete: true,
    counters: {
      ...counters,
      objectsQueued: Number(counters.objectsQueued ?? 0) + rows.length,
      databaseDiscoveryComplete: true,
    },
  };
}

async function processObjectDiscovery(job: NonNullable<ClaimedJob>): Promise<void> {
  const discovered = await discoverDatabaseObjects(job);
  if (!discovered.complete) return;

  if (job.scope === "USER" || !features.storage) {
    await transitionJob(job.id, "OBJECT_DELETION", {
      counters: discovered.counters,
      objectScanCursor: null,
      objectScanComplete: true,
    });
    return;
  }

  const page = await listStoredObjectsPage({
    prefix: `tenants/${job.targetId}/`,
    continuationToken: job.objectScanCursor,
    maxKeys: DISCOVERY_PAGE_SIZE,
  });
  if (page.objects.length) {
    const keys = page.objects.map((object) => object.key);
    await systemPrisma.objectDeletionTask.createMany({
      data: page.objects.map((object) => ({
        jobId: job.id,
        tenantId: job.targetId,
        key: object.key,
        reason: "tenant_prefix_deletion",
      })),
      skipDuplicates: true,
    });
    await systemPrisma.objectDeletionTask.updateMany({
      where: { key: { in: keys } },
      data: { jobId: job.id, tenantId: job.targetId },
    });
  }
  const counters = {
    ...discovered.counters,
    objectsQueued:
      Number(discovered.counters.objectsQueued ?? 0) + page.objects.length,
  };
  await transitionJob(
    job.id,
    page.continuationToken ? "OBJECT_DISCOVERY" : "OBJECT_DELETION",
    {
      counters,
      objectScanCursor: page.continuationToken,
      objectScanComplete: !page.continuationToken,
    },
  );
}

async function claimObjectTask(jobId?: string) {
  const now = new Date();
  const candidate = await systemPrisma.objectDeletionTask.findFirst({
    where: {
      ...(jobId ? { jobId } : {}),
      status: { in: ["PENDING", "RETRYING", "PROCESSING"] },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;
  const claimed = await systemPrisma.objectDeletionTask.updateMany({
    where: {
      id: candidate.id,
      status: { in: ["PENDING", "RETRYING", "PROCESSING"] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      leaseUntil: new Date(now.getTime() + OBJECT_LEASE_MS),
    },
  });
  if (claimed.count !== 1) return null;
  return systemPrisma.objectDeletionTask.findUnique({ where: { id: candidate.id } });
}

async function processObjectBatch(
  deadlineAt: number,
  jobId?: string,
): Promise<{ deleted: number; failures: number }> {
  let deleted = 0;
  let failures = 0;
  while (Date.now() < deadlineAt - 750 && deleted + failures < 50) {
    const task = await claimObjectTask(jobId);
    if (!task) break;
    try {
      await deleteObject(task.key);
      await systemPrisma.objectDeletionTask.update({
        where: { id: task.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          leaseUntil: null,
          lastError: null,
        },
      });
      deleted += 1;
    } catch (error) {
      const exhausted = task.attempts >= MAX_FAILURES;
      await systemPrisma.objectDeletionTask.update({
        where: { id: task.id },
        data: {
          status: exhausted ? "EXHAUSTED" : "RETRYING",
          nextAttemptAt: retryAt(task.attempts),
          leaseUntil: null,
          lastError: safeError(error),
        },
      });
      failures += 1;
    }
  }
  return { deleted, failures };
}

async function processObjectDeletion(
  job: NonNullable<ClaimedJob>,
  deadlineAt: number,
): Promise<{ deleted: number; failures: number }> {
  const result = await processObjectBatch(deadlineAt, job.id);
  const [remaining, exhausted] = await Promise.all([
    systemPrisma.objectDeletionTask.count({
      where: {
        jobId: job.id,
        status: { in: ["PENDING", "PROCESSING", "RETRYING"] },
      },
    }),
    systemPrisma.objectDeletionTask.count({
      where: { jobId: job.id, status: "EXHAUSTED" },
    }),
  ]);
  if (exhausted) {
    await systemPrisma.dataDeletionJob.update({
      where: { id: job.id },
      data: {
        status: "BLOCKED",
        leaseUntil: null,
        lastError: `${exhausted} object deletion task(s) exhausted retries`,
      },
    });
  } else if (remaining) {
    await systemPrisma.dataDeletionJob.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(Date.now() + 30_000),
        leaseUntil: null,
        lastError: null,
      },
    });
  } else {
    await transitionJob(job.id, "DATABASE");
  }
  return result;
}

async function completeJob(job: NonNullable<ClaimedJob>): Promise<void> {
  await systemPrisma.dataDeletionJob.update({
    where: { id: job.id },
    data: {
      status: "COMPLETED",
      phase: "COMPLETED",
      completedAt: new Date(),
      leaseUntil: null,
      nextAttemptAt: new Date(),
      lastError: null,
      requestedById: null,
      targetLabel: null,
    },
  });
}

async function deleteTenantDatabase(job: NonNullable<ClaimedJob>): Promise<void> {
  const tenant = await systemPrisma.tenant.findUnique({
    where: { id: job.targetId },
    select: { id: true },
  });
  if (tenant) {
    const now = new Date();
    await systemPrisma.$transaction(async (tx) => {
      await tx.auditLog.updateMany({
        where: { tenantId: tenant.id },
        data: {
          tenantScopeHash: scopeHash(tenant.id),
          retentionUntil: retentionUntil(now, AUDIT_RETENTION_YEARS),
        },
      });
      await tx.stripeWebhookEvent.updateMany({
        where: { tenantId: tenant.id },
        data: { tenantId: null },
      });
      await tx.tenant.delete({ where: { id: tenant.id } });
      await tx.storageReconciliationState.deleteMany({
        where: { tenantId: tenant.id },
      });
      await tx.objectDeletionTask.updateMany({
        where: { jobId: job.id },
        data: { tenantId: null },
      });
    });
  }
  await completeJob(job);
}

async function deleteUserDatabase(job: NonNullable<ClaimedJob>): Promise<void> {
  const user = await systemPrisma.user.findUnique({
    where: { id: job.targetId },
    select: { id: true, email: true },
  });
  if (!user) {
    await completeJob(job);
    return;
  }
  const pseudonym = `deleted:${scopeHash(user.id).slice(0, 32)}`;
  const deletedEmail = `${pseudonym.replace(":", "+")}@deleted.invalid`;

  await systemPrisma.$transaction(async (tx) => {
    await tx.newsletterDelivery.deleteMany({ where: { userId: user.id } });
    await tx.newsletterConsentEvent.deleteMany({ where: { userId: user.id } });
    await tx.newsletterConsent.deleteMany({ where: { userId: user.id } });
    await tx.emailSuppression.deleteMany({ where: { userId: user.id } });
    await tx.emailEvent.deleteMany({ where: { userId: user.id } });
    await tx.automationDelivery.deleteMany({ where: { userId: user.id } });
    await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
    await tx.notification.deleteMany({
      where: { OR: [{ userId: user.id }, { actorId: user.id }] },
    });
    await tx.assistantConversation.deleteMany({ where: { userId: user.id } });
    await tx.conversationMember.deleteMany({ where: { userId: user.id } });
    await tx.reaction.deleteMany({ where: { userId: user.id } });
    await tx.requestVote.deleteMany({ where: { userId: user.id } });
    await tx.entitlement.deleteMany({ where: { userId: user.id } });
    await tx.pointsLedger.deleteMany({ where: { userId: user.id } });
    await tx.badgeAward.deleteMany({ where: { userId: user.id } });
    await tx.memberStats.deleteMany({ where: { userId: user.id } });
    await tx.lessonProgress.deleteMany({ where: { userId: user.id } });
    await tx.eventRsvp.deleteMany({ where: { userId: user.id } });
    await tx.recommendation.deleteMany({ where: { userId: user.id } });
    await tx.membership.deleteMany({ where: { userId: user.id } });
    await tx.storageObject.deleteMany({ where: { ownerId: user.id } });
    await tx.storageUploadReservation.deleteMany({ where: { ownerId: user.id } });
    await tx.pendingCreatorCheckout.deleteMany({ where: { userId: user.id } });
    await tx.story.deleteMany({ where: { authorId: user.id } });

    await tx.comment.updateMany({
      where: { authorId: user.id },
      data: { body: "[deleted]" },
    });
    await tx.post.updateMany({
      where: { authorId: user.id },
      data: {
        title: null,
        body: "",
        bodyHtml: null,
        imageUrl: null,
        videoUrl: null,
        teaserUrl: null,
      },
    });
    await tx.chatMessage.updateMany({
      where: { userId: user.id },
      data: { body: "[deleted]" },
    });
    await tx.liveChatMessage.updateMany({
      where: { userId: user.id },
      data: { body: "[deleted]" },
    });
    await tx.memberRequest.updateMany({
      where: { requesterId: user.id },
      data: { title: "[deleted]", body: "", staffNote: null },
    });
    await tx.tip.updateMany({
      where: { userId: user.id },
      data: { message: null, isPublic: false },
    });
    await tx.order.updateMany({
      where: { userId: user.id },
      data: { shippingDetails: Prisma.DbNull },
    });
    await tx.aiCreditPurchase.updateMany({
      where: { userId: user.id },
      data: { userId: null },
    });
    await tx.aiUsageEvent.updateMany({
      where: { userId: user.id },
      data: { userId: null },
    });
    await tx.aiCreditReservation.updateMany({
      where: { userId: user.id },
      data: { userId: null },
    });
    await tx.referralConversion.updateMany({
      where: { referrerId: user.id },
      data: { referrerId: pseudonym },
    });
    await tx.referralConversion.updateMany({
      where: { referredId: user.id },
      data: { referredId: pseudonym },
    });
    await tx.moderationFlag.updateMany({
      where: { authorId: user.id },
      data: { authorId: null },
    });
    await tx.moderationFlag.updateMany({
      where: { resolvedById: user.id },
      data: { resolvedById: null },
    });
    await tx.auditLog.updateMany({
      where: { actorUserId: user.id },
      data: { actorUserId: null },
    });
    await tx.$executeRaw`
      UPDATE "AuditLog"
      SET metadata = metadata - 'email' - 'name' - 'recipientEmail'
      WHERE "actorUserId" IS NULL
        AND metadata::text ILIKE ${`%${user.email}%`}
    `.catch(() => 0);
    await tx.user.update({
      where: { id: user.id },
      data: {
        email: deletedEmail,
        name: "Deleted user",
        passwordHash: `!deleted:${randomUUID()}`,
        avatarUrl: null,
        emailVerifiedAt: null,
        totpSecret: null,
        totpEnabledAt: null,
        platformRole: "USER",
        accountStatus: "DELETED",
        sessionVersion: { increment: 1 },
      },
    });
  });
  await completeJob(job);
}

async function processDatabaseDeletion(job: NonNullable<ClaimedJob>): Promise<void> {
  if (job.scope === "TENANT") await deleteTenantDatabase(job);
  else await deleteUserDatabase(job);
}

async function processClaimedJob(
  job: NonNullable<ClaimedJob>,
  deadlineAt: number,
): Promise<{ deleted: number; failures: number }> {
  if (job.phase === "BILLING") await processBilling(job);
  else if (job.phase === "RETENTION") await processRetention(job);
  else if (job.phase === "OBJECT_DISCOVERY") await processObjectDiscovery(job);
  else if (job.phase === "OBJECT_DELETION") {
    return processObjectDeletion(job, deadlineAt);
  } else if (job.phase === "DATABASE") await processDatabaseDeletion(job);
  else throw new Error(`Unknown lifecycle phase: ${job.phase}`);
  return { deleted: 0, failures: 0 };
}

async function reconcileOneTenant(): Promise<number> {
  if (!features.storage) return 0;
  const candidates = await systemPrisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT t.id
    FROM "Tenant" t
    LEFT JOIN "StorageReconciliationState" s ON s."tenantId" = t.id
    WHERE t.status = 'ACTIVE'::"TenantStatus"
    ORDER BY s."lastCompletedAt" ASC NULLS FIRST, t."createdAt" ASC
    LIMIT 1
  `);
  const tenantId = candidates[0]?.id;
  if (!tenantId) return 0;
  let state = await systemPrisma.storageReconciliationState.findUnique({
    where: { tenantId },
  });
  if (!state?.continuationToken) {
    state = await systemPrisma.storageReconciliationState.upsert({
      where: { tenantId },
      create: { tenantId, scanStartedAt: new Date() },
      update: { scanStartedAt: new Date(), lastScanned: 0, lastOrphans: 0 },
    });
  }
  const page = await listStoredObjectsPage({
    prefix: `tenants/${tenantId}/`,
    continuationToken: state.continuationToken,
    maxKeys: DISCOVERY_PAGE_SIZE,
  });
  const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
  const eligible = page.objects.filter(
    (object) => object.lastModified && object.lastModified.getTime() <= cutoff,
  );
  const keys = eligible.map((object) => object.key);
  const [objects, reservations] = keys.length
    ? await Promise.all([
        systemPrisma.storageObject.findMany({
          where: { tenantId, key: { in: keys } },
          select: { key: true },
        }),
        systemPrisma.storageUploadReservation.findMany({
          where: { tenantId, key: { in: keys } },
          select: { key: true },
        }),
      ])
    : [[], []];
  const known = new Set([
    ...objects.map((object) => object.key),
    ...reservations.map((reservation) => reservation.key),
  ]);
  const orphans = keys.filter((key) => !known.has(key));
  if (orphans.length) {
    await systemPrisma.objectDeletionTask.createMany({
      data: orphans.map((key) => ({
        tenantId,
        key,
        reason: "orphan_reconciliation",
      })),
      skipDuplicates: true,
    });
  }
  await systemPrisma.storageReconciliationState.update({
    where: { tenantId },
    data: {
      continuationToken: page.continuationToken,
      lastScanned: { increment: page.objects.length },
      lastOrphans: { increment: orphans.length },
      ...(page.continuationToken
        ? {}
        : { lastCompletedAt: new Date(), scanStartedAt: null }),
    },
  });
  return orphans.length;
}

/**
 * Enforce every recorded retention deadline in bounded pages. Operational job
 * rows are kept briefly for support evidence, then removed as well so object
 * keys and deleted account ids never become an accidental permanent archive.
 */
async function purgeExpiredLifecycleRecords(now = new Date()) {
  const completedObjectCutoff = new Date(
    now.getTime() - COMPLETED_OBJECT_TASK_RETENTION_DAYS * 24 * 60 * 60_000,
  );
  const completedJobCutoff = new Date(
    now.getTime() - COMPLETED_JOB_RETENTION_DAYS * 24 * 60 * 60_000,
  );
  const [billing, audits, objectTasks, jobs] = await Promise.all([
    systemPrisma.$executeRaw(Prisma.sql`
      DELETE FROM "BillingRetentionRecord"
      WHERE id IN (
        SELECT id FROM "BillingRetentionRecord"
        WHERE "retainUntil" <= ${now}
        ORDER BY "retainUntil" ASC
        LIMIT ${PURGE_PAGE_SIZE}
      )
    `),
    systemPrisma.$executeRaw(Prisma.sql`
      DELETE FROM "AuditLog"
      WHERE id IN (
        SELECT id FROM "AuditLog"
        WHERE "retentionUntil" IS NOT NULL AND "retentionUntil" <= ${now}
        ORDER BY "retentionUntil" ASC
        LIMIT ${PURGE_PAGE_SIZE}
      )
    `),
    systemPrisma.$executeRaw(Prisma.sql`
      DELETE FROM "ObjectDeletionTask"
      WHERE id IN (
        SELECT id FROM "ObjectDeletionTask"
        WHERE status = 'COMPLETED'::"ObjectDeletionStatus"
          AND "completedAt" < ${completedObjectCutoff}
        ORDER BY "completedAt" ASC
        LIMIT ${PURGE_PAGE_SIZE}
      )
    `),
    systemPrisma.$executeRaw(Prisma.sql`
      DELETE FROM "DataDeletionJob"
      WHERE id IN (
        SELECT id FROM "DataDeletionJob"
        WHERE status = 'COMPLETED'::"DataDeletionStatus"
          AND "completedAt" < ${completedJobCutoff}
        ORDER BY "completedAt" ASC
        LIMIT ${PURGE_PAGE_SIZE}
      )
    `),
  ]);
  return {
    billingRetentionRecordsPurged: billing,
    auditRecordsPurged: audits,
    completedObjectTasksPurged: objectTasks,
    completedJobsPurged: jobs,
  };
}

/** Process bounded lifecycle work under the cron route's global deadline. */
export async function runDataLifecycleJobs(input: {
  deadlineAt: number;
}): Promise<LifecycleRunResult> {
  const result: LifecycleRunResult = {
    jobsProcessed: 0,
    jobsCompleted: 0,
    jobsRetried: 0,
    objectsDeleted: 0,
    objectFailures: 0,
    orphanObjectsQueued: 0,
    billingRetentionRecordsPurged: 0,
    auditRecordsPurged: 0,
    completedObjectTasksPurged: 0,
    completedJobsPurged: 0,
  };

  const looseObjects = await processObjectBatch(input.deadlineAt);
  result.objectsDeleted += looseObjects.deleted;
  result.objectFailures += looseObjects.failures;

  while (Date.now() < input.deadlineAt - 1_000 && result.jobsProcessed < 20) {
    const job = await claimDeletionJob();
    if (!job) break;
    result.jobsProcessed += 1;
    try {
      const before = job.status;
      const objectResult = await processClaimedJob(job, input.deadlineAt);
      result.objectsDeleted += objectResult.deleted;
      result.objectFailures += objectResult.failures;
      const current = await systemPrisma.dataDeletionJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      if (current?.status === "COMPLETED") result.jobsCompleted += 1;
      if (before === "RETRYING" && current?.status !== "COMPLETED") {
        result.jobsRetried += 1;
      }
    } catch (error) {
      await retryJob(job, error);
      result.jobsRetried += 1;
    }
  }

  if (Date.now() < input.deadlineAt - 2_000) {
    const purged = await purgeExpiredLifecycleRecords();
    Object.assign(result, purged);
  }

  if (Date.now() < input.deadlineAt - 2_000) {
    try {
      result.orphanObjectsQueued = await reconcileOneTenant();
    } catch {
      // Reconciliation is best-effort and resumes from its persisted cursor.
      // Destructive tenant/user jobs above keep their own explicit status.
    }
  }
  return result;
}
