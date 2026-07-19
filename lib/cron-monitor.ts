import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { systemPrisma } from "@/lib/prisma";
import { cronJson } from "@/lib/cron-auth";
import { logOperationalEvent } from "@/lib/observability";

export const CRON_JOB_NAMES = [
  "posts",
  "newsletters",
  "webhooks",
  "automations",
  "inventory",
  "uploads",
  "lifecycle",
] as const;

export type CronJobName = (typeof CRON_JOB_NAMES)[number];

const DEFAULT_DEADLINE_MS = 40_000;
const DEFAULT_LEASE_MS = 180_000;
const MAX_ERROR_LENGTH = 500;
const MAX_COUNTERS = 32;

export interface CronJobContext {
  /** Advisory cutoff. Workers must not claim another chunk after this time. */
  deadlineAt: number;
}

export type CronJobResult = object;

export type CronJobExecution<T extends CronJobResult> =
  | { executed: true; result: T; durationMs: number }
  | { executed: false; reason: "already-running" };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

/** Store useful diagnostics without persisting credentials or personal data. */
export function sanitizeCronError(error: unknown): string {
  const source = error instanceof Error ? error.message : String(error);
  const sanitized = source
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/https?:\/\/[^\s]+/gi, (raw) => {
      try {
        const url = new URL(raw);
        return `${url.protocol}//${url.host}${url.pathname}`;
      } catch {
        return "[url]";
      }
    })
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_./+=-]{32,}\b/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return (sanitized || "Cron job failed").slice(0, MAX_ERROR_LENGTH);
}

/** Keep only bounded finite numeric counters from a job result. */
export function cronCounters(result: CronJobResult): Prisma.InputJsonObject {
  const counters: Record<string, number> = {};
  for (const [key, value] of Object.entries(result).slice(0, MAX_COUNTERS)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    counters[key.slice(0, 64)] = Math.max(
      Number.MIN_SAFE_INTEGER,
      Math.min(Number.MAX_SAFE_INTEGER, value),
    );
  }
  return counters;
}

async function acquireJob(
  job: CronJobName,
  token: string,
  startedAt: Date,
  leaseUntil: Date,
): Promise<boolean> {
  try {
    await systemPrisma.cronJobHeartbeat.create({
      data: {
        job,
        status: "RUNNING",
        runToken: token,
        lastStartedAt: startedAt,
        leaseUntil,
        totalRuns: 1,
      },
    });
    return true;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  const acquired = await systemPrisma.cronJobHeartbeat.updateMany({
    where: {
      job,
      OR: [
        { status: { not: "RUNNING" } },
        { leaseUntil: null },
        { leaseUntil: { lte: startedAt } },
      ],
    },
    data: {
      status: "RUNNING",
      runToken: token,
      lastStartedAt: startedAt,
      leaseUntil,
      totalRuns: { increment: 1 },
    },
  });
  return acquired.count === 1;
}

/**
 * Execute one globally leased cron job and persist its latest heartbeat.
 * Completion uses the run token as a compare-and-set boundary, so a stale
 * worker can never overwrite the status of a newer lease owner.
 */
export async function runCronJob<T extends CronJobResult>(
  job: CronJobName,
  handler: (context: CronJobContext) => Promise<T>,
  options: { deadlineMs?: number; leaseMs?: number } = {},
): Promise<CronJobExecution<T>> {
  const startedAt = new Date();
  const token = randomUUID();
  const deadlineMs = Math.min(Math.max(options.deadlineMs ?? DEFAULT_DEADLINE_MS, 1_000), 120_000);
  const leaseMs = Math.max(options.leaseMs ?? DEFAULT_LEASE_MS, deadlineMs + 30_000);
  const leaseUntil = new Date(startedAt.getTime() + leaseMs);
  const acquired = await acquireJob(job, token, startedAt, leaseUntil);
  if (!acquired) return { executed: false, reason: "already-running" };

  try {
    const result = await handler({ deadlineAt: startedAt.getTime() + deadlineMs });
    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
    await systemPrisma.cronJobHeartbeat.updateMany({
      where: { job, runToken: token, status: "RUNNING" },
      data: {
        status: "SUCCEEDED",
        lastSucceededAt: finishedAt,
        lastDurationMs: durationMs,
        lastCounters: cronCounters(result),
        lastError: null,
        runToken: null,
        leaseUntil: null,
        totalSucceeded: { increment: 1 },
      },
    });
    return { executed: true, result, durationMs };
  } catch (error) {
    const finishedAt = new Date();
    await systemPrisma.cronJobHeartbeat.updateMany({
      where: { job, runToken: token, status: "RUNNING" },
      data: {
        status: "FAILED",
        lastFailedAt: finishedAt,
        lastDurationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        lastCounters: {},
        lastError: sanitizeCronError(error),
        runToken: null,
        leaseUntil: null,
        totalFailed: { increment: 1 },
      },
    });
    throw error;
  }
}

/** Central route wrapper: monitor, serialize skips and hide internal errors. */
export async function runCronRoute<T extends CronJobResult>(
  job: CronJobName,
  handler: (context: CronJobContext) => Promise<T>,
) {
  try {
    const execution = await runCronJob(job, handler);
    if (!execution.executed) {
      logOperationalEvent("warn", "cron_job_skipped", {
        job,
        reason: execution.reason,
      });
      return cronJson({ ok: true, skipped: true, reason: execution.reason }, 202);
    }
    logOperationalEvent("info", "cron_job_succeeded", {
      job,
      durationMs: execution.durationMs,
      counters: cronCounters(execution.result),
    });
    return cronJson({ ok: true, ...execution.result });
  } catch (error) {
    logOperationalEvent("error", "cron_job_failed", {
      job,
      error: sanitizeCronError(error),
    });
    return cronJson({ ok: false, error: "job-failed" }, 500);
  }
}
