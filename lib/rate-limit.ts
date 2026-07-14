import "server-only";
import { headers } from "next/headers";

/**
 * Fixed-Window-Rate-Limiter mit zwei Backends:
 *
 * - **Redis** (wenn `REDIS_URL` gesetzt): prozess- und instanzübergreifend —
 *   produktionsreif für horizontale Skalierung. INCR + PEXPIRE, fail-open:
 *   Wenn Redis nicht erreichbar ist, wird der Request durchgelassen (Ausfall
 *   der Rate-Limits darf nie Login/Signup lahmlegen) und der Fehler geloggt.
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
    return true;
  }
  bucket.count += 1;
  // Opportunistic cleanup so the map cannot grow unbounded.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  return bucket.count <= limit;
}

// ---------------------------------------------------------------- Redis
type RedisLike = {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
};

const g = globalThis as unknown as { __aeraRedis?: RedisLike | null };

async function getRedis(): Promise<RedisLike | null> {
  if (g.__aeraRedis !== undefined) return g.__aeraRedis;
  const url = process.env.REDIS_URL;
  if (!url) {
    g.__aeraRedis = null;
    return null;
  }
  try {
    // Lazy import: ohne REDIS_URL wird ioredis nie geladen.
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.on("error", (e: Error) => {
      console.error("Redis (rate-limit) error:", e.message);
    });
    g.__aeraRedis = client as unknown as RedisLike;
  } catch (e) {
    console.error("Redis init failed — falling back to in-memory rate limits:", e);
    g.__aeraRedis = null;
  }
  return g.__aeraRedis;
}

async function redisRateLimit(
  redis: RedisLike,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const redisKey = `rl:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    // Erstes Ereignis im Fenster -> Ablauf setzen.
    await redis.pexpire(redisKey, windowMs);
  }
  return count <= limit;
}

// ---------------------------------------------------------------- API
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const redis = await getRedis();
  if (redis) {
    try {
      return await redisRateLimit(redis, key, limit, windowMs);
    } catch (e) {
      // Fail-open: Verfügbarkeit schlägt Drosselung.
      console.error("Redis rate-limit failed (fail-open):", (e as Error).message);
      return true;
    }
  }
  return memoryRateLimit(key, limit, windowMs);
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
