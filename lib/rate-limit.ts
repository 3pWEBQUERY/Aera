import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type Redis from "ioredis";
import { getRedisCommandClient, isRedisConfigured } from "./redis";
import { logOperationalEvent } from "./observability";

/**
 * Fixed-Window-Rate-Limiter mit zwei Backends:
 *
 * - **Redis** (wenn `REDIS_URL` gesetzt): prozess- und instanzübergreifend.
 *   Ein Lua-Skript erhöht den Zähler und setzt die TTL atomar.
 * - **Degraded**: Wenn ein konfiguriertes Redis vorübergehend ausfällt, greift
 *   ein konservativer In-Memory-Limiter mit halbem Kontingent. Der Schutz ist
 *   damit instanzlokal, aber niemals vollständig fail-open.
 * - **In-Memory** (Fallback ohne `REDIS_URL`): wie bisher, per Prozess.
 *
 * API ist async — Aufrufer verwenden `await rateLimit(...)`.
 */

// ---------------------------------------------------------------- In-Memory
const buckets = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    cleanupMemoryBuckets(now);
    return true;
  }
  bucket.count += 1;
  cleanupMemoryBuckets(now);
  return bucket.count <= limit;
}

function cleanupMemoryBuckets(now: number): void {
  // Opportunistic cleanup so the map cannot grow without bound. If more than
  // 10k live buckets remain, evict oldest entries until the hard cap is met.
  if (buckets.size <= 10_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size <= 10_000) return;
  const overflow = buckets.size - 10_000;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

// ---------------------------------------------------------------- Redis
const RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if count == 1 or ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return count
`;

async function redisRateLimit(
  redis: Redis,
  keyHash: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const redisKey = `aera:rl:v1:${keyHash}`;
  const result = await redis.eval(RATE_LIMIT_SCRIPT, 1, redisKey, windowMs);
  const count = Number(result);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error("invalid_redis_rate_limit_result");
  }
  return count <= limit;
}

const rateLimitState = globalThis as unknown as {
  __aeraRateLimitLastRedisErrorAt?: number;
};

function logDegradedMode(): void {
  const now = Date.now();
  if (now - (rateLimitState.__aeraRateLimitLastRedisErrorAt ?? 0) < 30_000) return;
  rateLimitState.__aeraRateLimitLastRedisErrorAt = now;
  logOperationalEvent("error", "rate_limit_redis_degraded", {
    fallback: "conservative-local-throttling",
  });
}

// ---------------------------------------------------------------- API
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (
    !key ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1
  ) {
    throw new Error("Invalid rate-limit configuration");
  }
  // Fixed-size, non-identifying keys avoid putting IP addresses/user IDs into
  // Redis and bound memory use even for hostile forwarding headers.
  const keyHash = createHash("sha256").update(key).digest("hex");

  const redis = await getRedisCommandClient();
  if (redis) {
    try {
      return await redisRateLimit(redis, keyHash, limit, windowMs);
    } catch {
      logDegradedMode();
      return memoryRateLimit(
        `degraded:${keyHash}`,
        Math.max(1, Math.ceil(limit / 2)),
        windowMs,
      );
    }
  }

  // Missing Redis is the expected local-development mode. In production the
  // central environment validator rejects this deployment before serving.
  if (isRedisConfigured()) {
    logDegradedMode();
    return memoryRateLimit(
      `degraded:${keyHash}`,
      Math.max(1, Math.ceil(limit / 2)),
      windowMs,
    );
  }
  return memoryRateLimit(keyHash, limit, windowMs);
}

/** Best-effort client IP for rate-limit keys. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local"
  );
}
