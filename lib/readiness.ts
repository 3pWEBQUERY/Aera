import "server-only";
import { systemPrisma } from "./prisma";
import { validateEnvironment } from "./env-validation";
import { checkRedisHealth, isRedisConfigured } from "./redis";
import { checkStorageHealth } from "./storage";
import { checkMalwareScanner } from "./malware-scan";

type CheckStatus = "up" | "down" | "disabled";
type ReadinessCheck = { status: CheckStatus; latencyMs?: number };

export interface ReadinessSnapshot {
  status: "ok" | "degraded";
  release: string;
  checks: {
    configuration: ReadinessCheck;
    database: ReadinessCheck;
    redis: ReadinessCheck;
    storage: ReadinessCheck;
    malwareScanner: ReadinessCheck;
  };
}

const CACHE_MS = 5_000;
let cached: { expiresAt: number; promise: Promise<ReadinessSnapshot> } | null = null;

function releaseId(): string {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.SOURCE_VERSION ??
    "unknown"
  ).slice(0, 40);
}

function isStrictRuntime(): boolean {
  return (
    process.env.AERA_ENVIRONMENT === "production" ||
    process.env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === "production"
  );
}

async function databaseCheck(): Promise<ReadinessCheck> {
  const startedAt = Date.now();
  try {
    const result = await Promise.race([
      systemPrisma.$queryRaw<Array<{ unfinished_migrations: bigint }>>`
        SELECT COUNT(*)::bigint AS unfinished_migrations
        FROM "_prisma_migrations"
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
      `,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("database readiness timeout")), 2_500),
      ),
    ]);
    if (Number(result[0]?.unfinished_migrations ?? 0) !== 0) return { status: "down" };
    return { status: "up", latencyMs: Date.now() - startedAt };
  } catch {
    return { status: "down" };
  }
}

async function buildSnapshot(): Promise<ReadinessSnapshot> {
  const strict = isStrictRuntime();
  let configuration: ReadinessCheck = { status: "up" };
  try {
    validateEnvironment(process.env, strict ? "production" : "development");
  } catch {
    configuration = { status: "down" };
  }

  const storageConfigured = Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
  const malwareConfigured = Boolean(process.env.CLAMAV_HOST);

  const [database, redisResult, storageOk, malwareOk] = await Promise.all([
    databaseCheck(),
    isRedisConfigured() ? checkRedisHealth() : Promise.resolve(null),
    storageConfigured ? checkStorageHealth() : Promise.resolve(false),
    malwareConfigured ? checkMalwareScanner() : Promise.resolve(false),
  ]);

  const redis: ReadinessCheck = redisResult
    ? redisResult.ok
      ? { status: "up", latencyMs: redisResult.latencyMs }
      : { status: "down" }
    : { status: strict ? "down" : "disabled" };
  const storage: ReadinessCheck = storageConfigured
    ? { status: storageOk ? "up" : "down" }
    : { status: strict ? "down" : "disabled" };
  const malwareScanner: ReadinessCheck = malwareConfigured
    ? { status: malwareOk ? "up" : "down" }
    : { status: strict ? "down" : "disabled" };

  const checks = { configuration, database, redis, storage, malwareScanner };
  const required = Object.values(checks).filter((check) => check.status !== "disabled");
  return {
    status: required.every((check) => check.status === "up") ? "ok" : "degraded",
    release: releaseId(),
    checks,
  };
}

export function getReadinessSnapshot(): Promise<ReadinessSnapshot> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = buildSnapshot();
  cached = { expiresAt: now + CACHE_MS, promise };
  return promise;
}

export function resetReadinessCacheForTests(): void {
  cached = null;
}

