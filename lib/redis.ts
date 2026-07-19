import "server-only";

import type Redis from "ioredis";
import { logOperationalEvent } from "./observability";

/**
 * Redis connections are process-wide singletons. Next.js can evaluate server
 * modules more than once during development, so keeping them on globalThis
 * prevents one TCP connection per route/module reload.
 *
 * Pub/Sub needs dedicated connections because a subscribed Redis connection
 * cannot execute ordinary commands.
 */
export type RedisConnectionRole = "command" | "publisher" | "subscriber";

type RedisState = {
  url: string;
  clients: Partial<Record<RedisConnectionRole, Redis>>;
  initializers: Partial<Record<RedisConnectionRole, Promise<Redis | null>>>;
  lastErrorLogAt: Partial<Record<RedisConnectionRole, number>>;
};

const globalRedis = globalThis as unknown as {
  __aeraRedisConnections?: RedisState;
};

const ERROR_LOG_INTERVAL_MS = 30_000;
const HEALTH_TIMEOUT_MS = 1_000;

function configuredUrl(): string {
  const value = (process.env.REDIS_URL ?? "").trim();
  return /^rediss?:\/\//i.test(value) ? value : "";
}

export function isRedisConfigured(): boolean {
  return Boolean((process.env.REDIS_URL ?? "").trim());
}

function connectionState(url: string): RedisState {
  const existing = globalRedis.__aeraRedisConnections;
  if (existing?.url === url) return existing;

  // This branch is mainly useful for tests and local env reloads. Production
  // environment variables do not change during a process lifetime.
  if (existing) {
    for (const client of Object.values(existing.clients)) {
      client?.disconnect(false);
    }
  }

  const next: RedisState = {
    url,
    clients: {},
    initializers: {},
    lastErrorLogAt: {},
  };
  globalRedis.__aeraRedisConnections = next;
  return next;
}

function logConnectionError(
  state: RedisState,
  role: RedisConnectionRole,
  error: unknown,
): void {
  const now = Date.now();
  if (now - (state.lastErrorLogAt[role] ?? 0) < ERROR_LOG_INTERVAL_MS) return;
  state.lastErrorLogAt[role] = now;

  // Do not log the URL (which may contain a password) or the full error.
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  logOperationalEvent("error", "redis_connection_unavailable", { role, code });
}

async function getRedisConnection(role: RedisConnectionRole): Promise<Redis | null> {
  const url = configuredUrl();
  if (!url) return null;

  const state = connectionState(url);
  const current = state.clients[role];
  if (current && current.status !== "end") return current;

  if (state.initializers[role]) return state.initializers[role]!;

  const initializer = (async () => {
    try {
      const { default: RedisClient } = await import("ioredis");
      const client = new RedisClient(url, {
        autoResubscribe: true,
        commandTimeout: 1_500,
        connectTimeout: 2_000,
        enableOfflineQueue: false,
        enableReadyCheck: true,
        keepAlive: 10_000,
        lazyConnect: false,
        maxRetriesPerRequest: 1,
        retryStrategy(attempt) {
          // Keep reconnecting in the background, but cap the delay so a brief
          // Railway Redis restart heals without recycling the web process.
          return Math.min(100 * 2 ** Math.min(attempt - 1, 5), 2_000);
        },
      });

      client.on("error", (error) => logConnectionError(state, role, error));
      client.on("end", () => {
        if (state.clients[role] !== client) return;
        delete state.clients[role];
        delete state.initializers[role];
      });
      state.clients[role] = client;
      return client;
    } catch (error) {
      logConnectionError(state, role, error);
      delete state.initializers[role];
      return null;
    }
  })();

  state.initializers[role] = initializer;
  return initializer;
}

export function getRedisCommandClient(): Promise<Redis | null> {
  return getRedisConnection("command");
}

export function getRedisPublisher(): Promise<Redis | null> {
  return getRedisConnection("publisher");
}

export function getRedisSubscriber(): Promise<Redis | null> {
  return getRedisConnection("subscriber");
}

export type RedisHealth =
  | { configured: false; ok: false; error: "not_configured" }
  | { configured: true; ok: false; error: "unavailable" }
  | { configured: true; ok: true; latencyMs: number };

/** Short, credential-free readiness probe for the shared command client. */
export async function checkRedisHealth(): Promise<RedisHealth> {
  if (!isRedisConfigured()) {
    return { configured: false, ok: false, error: "not_configured" };
  }

  const startedAt = Date.now();
  try {
    const client = await getRedisCommandClient();
    if (!client) return { configured: true, ok: false, error: "unavailable" };

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("redis_health_timeout")), HEALTH_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });

    if (result !== "PONG") {
      return { configured: true, ok: false, error: "unavailable" };
    }
    return { configured: true, ok: true, latencyMs: Date.now() - startedAt };
  } catch {
    return { configured: true, ok: false, error: "unavailable" };
  }
}
