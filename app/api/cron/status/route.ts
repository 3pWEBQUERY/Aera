import { authorizeCronRequest, cronJson } from "@/lib/cron-auth";
import { CRON_JOB_NAMES } from "@/lib/cron-monitor";
import { systemPrisma } from "@/lib/prisma";
import { PRODUCT_RESERVATION_RECLAIM_GRACE_MS } from "@/lib/product-inventory";

export const dynamic = "force-dynamic";

// Railway cron runs every five minutes. Allow one missed/delayed invocation
// before alerting so normal scheduler jitter does not page the operator.
const STALE_AFTER_MS = 12 * 60_000;
const BACKUP_STALE_AFTER_MS = 26 * 60 * 60_000;
const DATABASE_BACKUP_JOB = "database-backup";

/**
 * Read-only operational view for Railway/monitoring probes.
 * Authentication is identical to the mutating cron routes, but GET is safe
 * here because it never claims or changes work.
 */
export async function GET(req: Request) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;

  const now = new Date();
  const inventoryCutoff = new Date(
    now.getTime() - PRODUCT_RESERVATION_RECLAIM_GRACE_MS,
  );
  const [heartbeats, posts, scheduledCampaigns, newsletterDeliveries, webhooks, automations, inventory, uploads, deletionJobs, blockedDeletionJobs, objectDeletions] =
    await Promise.all([
      systemPrisma.cronJobHeartbeat.findMany({
        where: { job: { in: [...CRON_JOB_NAMES, DATABASE_BACKUP_JOB] } },
        orderBy: { job: "asc" },
        select: {
          job: true,
          status: true,
          lastStartedAt: true,
          lastSucceededAt: true,
          lastFailedAt: true,
          lastDurationMs: true,
          lastCounters: true,
          lastError: true,
          leaseUntil: true,
          totalRuns: true,
          totalSucceeded: true,
          totalFailed: true,
        },
      }),
      systemPrisma.post.count({
        where: { isPublished: false, scheduledAt: { not: null, lte: now } },
      }),
      systemPrisma.newsletterCampaign.count({
        where: {
          tenant: { status: "ACTIVE" },
          status: "SCHEDULED",
          scheduledAt: { not: null, lte: now },
        },
      }),
      systemPrisma.newsletterDelivery.count({
        where: {
          status: { in: ["PENDING", "RETRYING"] },
          nextAttemptAt: { lte: now },
        },
      }),
      systemPrisma.webhookDelivery.count({
        where: {
          status: { in: ["PENDING", "RETRYING"] },
          nextAttemptAt: { lte: now },
        },
      }),
      systemPrisma.automationDelivery.count({
        where: {
          status: { in: ["PENDING", "RETRYING"] },
          nextAttemptAt: { lte: now },
        },
      }),
      systemPrisma.order.count({
        where: {
          status: "PENDING",
          productId: { not: null },
          inventoryReleasedAt: null,
          inventoryReservationExpiresAt: { lte: inventoryCutoff },
        },
      }),
      systemPrisma.storageUploadReservation.count({
        where: {
          status: { in: ["RESERVED", "FAILED", "EXPIRED"] },
          expiresAt: { lte: now },
        },
      }),
      systemPrisma.dataDeletionJob.count({
        where: { status: { in: ["PENDING", "PROCESSING", "RETRYING"] } },
      }),
      systemPrisma.dataDeletionJob.count({ where: { status: "BLOCKED" } }),
      systemPrisma.objectDeletionTask.count({
        where: { status: { in: ["PENDING", "PROCESSING", "RETRYING", "EXHAUSTED"] } },
      }),
    ]);

  const byJob = new Map(heartbeats.map((heartbeat) => [heartbeat.job, heartbeat]));
  const jobs = CRON_JOB_NAMES.map((job) => {
    const heartbeat = byJob.get(job);
    const stale =
      !heartbeat?.lastStartedAt ||
      now.getTime() - heartbeat.lastStartedAt.getTime() > STALE_AFTER_MS;
    return heartbeat
      ? { ...heartbeat, stale }
      : { job, status: "NEVER" as const, stale: true };
  });
  const backupHeartbeat = byJob.get(DATABASE_BACKUP_JOB);
  const backup = backupHeartbeat
    ? {
        ...backupHeartbeat,
        stale:
          !backupHeartbeat.lastSucceededAt ||
          now.getTime() - backupHeartbeat.lastSucceededAt.getTime() >
            BACKUP_STALE_AFTER_MS,
      }
    : {
        job: DATABASE_BACKUP_JOB,
        status: "NEVER" as const,
        stale: true,
      };
  const unhealthy = jobs.some(
    (job) => job.stale || job.status === "FAILED",
  ) || backup.stale || backup.status === "FAILED";

  return cronJson(
    {
      ok: !unhealthy,
      checkedAt: now.toISOString(),
      jobs,
      backup,
      backlog: {
        posts,
        newsletters: {
          scheduledCampaigns,
          dueDeliveries: newsletterDeliveries,
        },
        webhooks,
        automations,
        inventory,
        uploads,
        lifecycle: {
          deletionJobs,
          blockedDeletionJobs,
          objectDeletions,
        },
      },
    },
    unhealthy ? 503 : 200,
  );
}
