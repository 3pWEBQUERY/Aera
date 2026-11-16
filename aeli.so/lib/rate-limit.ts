import "server-only";
import { createHash } from "node:crypto";
import type Redis from "ioredis";

/**
 * Ein Zähler pro Schlüssel und Zeitfenster (Fixed Window).
 *
 * Zwei Speicher, wie in Aera:
 *
 *   * **Redis**, sobald `REDIS_URL` gesetzt ist — zählt über alle Instanzen
 *     hinweg. Ein Lua-Skript erhöht und setzt die Ablaufzeit atomar.
 *   * **Prozessspeicher** ohne `REDIS_URL` (lokal, oder solange Aeli als eine
 *     Instanz läuft). Fällt ein konfiguriertes Redis aus, greift er ebenfalls —
 *     dann mit halbem Kontingent: lieber etwas strenger als gar nicht.
 *
 * Schlüssel werden gehasht, bevor sie Redis erreichen: IP-Adressen und
 * E-Mail-Adressen gehören nicht in einen fremden Speicher, und eine feste
 * Länge begrenzt, was ein feindlicher Header dort anrichten kann.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Sekunden bis zum nächsten erlaubten Versuch (0, wenn erlaubt). */
  retryAfter: number;
}

// ---------------------------------------------------------------- Speicher

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 20_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Falls fast alles noch gültig ist, fliegen die ältesten Einträge raus. Eine
  // unbegrenzte Map wäre der eigentliche Angriffspunkt: viele verschiedene
  // Schlüssel statt vieler Versuche.
  while (buckets.size >= MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

function memoryHit(key: string, limit: number, windowMs: number, increment: boolean): RateLimitResult {
  const now = Date.now();
  if (buckets.size >= MAX_KEYS) sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (!increment) return { ok: true, retryAfter: 0 };
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: limit >= 1, retryAfter: 0 };
  }
  if (increment) bucket.count += 1;
  const over = increment ? bucket.count > limit : bucket.count >= limit;
  return over
    ? { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) }
    : { ok: true, retryAfter: 0 };
}

// ---------------------------------------------------------------- Redis

const HIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if count == 1 or ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

const redisState = globalThis as unknown as {
  __aeliRedis?: Promise<Redis | null>;
  __aeliRedisLastErrorAt?: number;
};

function redisUrl(): string {
  return (process.env.REDIS_URL ?? "").trim();
}

function logRedisProblem(error: unknown): void {
  const now = Date.now();
  if (now - (redisState.__aeliRedisLastErrorAt ?? 0) < 30_000) return;
  redisState.__aeliRedisLastErrorAt = now;
  // Ohne URL und ohne vollen Fehler: beides kann ein Passwort enthalten.
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  console.error(`[aeli] Ratenbegrenzung: Redis nicht erreichbar (${code || "Fehler"}), zähle lokal.`);
}

async function redisClient(): Promise<Redis | null> {
  const url = redisUrl();
  if (!url) return null;
  redisState.__aeliRedis ??= (async () => {
    try {
      const { default: RedisClient } = await import("ioredis");
      const client = new RedisClient(url, {
        commandTimeout: 1_500,
        connectTimeout: 2_000,
        enableOfflineQueue: false,
        // Railways privates Netz kann reines IPv6 sein.
        family: 0,
        lazyConnect: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (attempt) => Math.min(100 * 2 ** Math.min(attempt - 1, 5), 2_000),
      });
      client.on("error", logRedisProblem);
      await new Promise<void>((resolve) => {
        if (client.status === "ready") return resolve();
        const timer = setTimeout(resolve, 2_500);
        client.once("ready", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      return client;
    } catch (error) {
      logRedisProblem(error);
      redisState.__aeliRedis = undefined;
      return null;
    }
  })();
  return redisState.__aeliRedis;
}

async function redisHit(
  redis: Redis,
  keyHash: string,
  limit: number,
  windowMs: number,
  increment: boolean,
): Promise<RateLimitResult> {
  const redisKey = `aeli:rl:v1:${keyHash}`;
  let count: number;
  let ttl: number;
  if (increment) {
    const result = (await redis.eval(HIT_SCRIPT, 1, redisKey, windowMs)) as [number, number];
    count = Number(result[0]);
    ttl = Number(result[1]);
  } else {
    const [value, pttl] = await Promise.all([redis.get(redisKey), redis.pttl(redisKey)]);
    count = Number(value ?? 0);
    ttl = Number(pttl);
  }
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("invalid_rate_limit_count");
  const over = increment ? count > limit : count >= limit;
  return over
    ? { ok: false, retryAfter: Math.max(1, Math.ceil(Math.max(ttl, 0) / 1000)) }
    : { ok: true, retryAfter: 0 };
}

// ---------------------------------------------------------------- API

async function hit(key: string, limit: number, windowMs: number, increment: boolean): Promise<RateLimitResult> {
  if (!key || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error("Ungültige Ratenbegrenzung");
  }
  const keyHash = createHash("sha256").update(key).digest("hex");

  const redis = await redisClient();
  if (redis) {
    try {
      return await redisHit(redis, keyHash, limit, windowMs, increment);
    } catch (error) {
      logRedisProblem(error);
      return memoryHit(`degraded:${keyHash}`, Math.max(1, Math.ceil(limit / 2)), windowMs, increment);
    }
  }
  if (redisUrl()) {
    return memoryHit(`degraded:${keyHash}`, Math.max(1, Math.ceil(limit / 2)), windowMs, increment);
  }
  return memoryHit(keyHash, limit, windowMs, increment);
}

/** Zählt einen Versuch und sagt, ob er noch erlaubt war. */
export function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  return hit(key, limit, windowMs, true);
}

/**
 * Fragt nur nach, ohne zu zählen. Für Grenzen, die ausschließlich
 * Fehlversuche zählen (Anmeldung): erst nachsehen, dann nur bei einem Fehler
 * `rateLimit` aufrufen.
 */
export function rateLimitStatus(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  return hit(key, limit, windowMs, false);
}

/**
 * Die IP des Anfragenden hinter Railways Edge — nur für Ratenbegrenzung, sie
 * wird nirgends gespeichert.
 *
 * Railway setzt `X-Real-IP` auf die verbindende Adresse. Der ERSTE Eintrag in
 * `X-Forwarded-For` ist dagegen, was der Client selbst hineingeschrieben hat:
 * wer ihn bei jeder Anfrage ändert, hätte jede Grenze umgangen. Ohne
 * `X-Real-IP` gilt deshalb der LETZTE Eintrag (der vom nächsten Proxy).
 * Wortgleich zu `ipFromHeaders` in Aeras lib/rate-limit.ts.
 */
export function ipFromHeaders(h: Pick<Headers, "get">): string {
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = h.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  return forwarded?.at(-1) || "local";
}

/** Alter Name, gleiche Regel. */
export const clientIp = ipFromHeaders;
