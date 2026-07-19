import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRedisHealth } from "@/lib/redis";

const redisGlobal = globalThis as unknown as {
  __aeraRedisConnections?: unknown;
};

const originalRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalRedisUrl;
  delete redisGlobal.__aeraRedisConnections;
  vi.restoreAllMocks();
});

describe("Redis health", () => {
  it("reports an unconfigured dependency without exposing environment data", async () => {
    delete process.env.REDIS_URL;
    expect(await checkRedisHealth()).toEqual({
      configured: false,
      ok: false,
      error: "not_configured",
    });
  });

  it("uses the shared command connection and reports only latency", async () => {
    process.env.REDIS_URL = "redis://private-user:private-password@redis.internal:6379";
    const ping = vi.fn(async () => "PONG");
    redisGlobal.__aeraRedisConnections = {
      url: process.env.REDIS_URL,
      clients: { command: { status: "ready", ping } },
      initializers: {},
      lastErrorLogAt: {},
    };

    const health = await checkRedisHealth();
    expect(health.configured).toBe(true);
    expect(health.ok).toBe(true);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(health)).not.toContain("private-password");
    expect(JSON.stringify(health)).not.toContain("redis.internal");
  });

  it("redacts command failures", async () => {
    process.env.REDIS_URL = "redis://private-user:private-password@redis.internal:6379";
    redisGlobal.__aeraRedisConnections = {
      url: process.env.REDIS_URL,
      clients: {
        command: {
          status: "ready",
          ping: vi.fn(async () => {
            throw new Error("private-password redis.internal");
          }),
        },
      },
      initializers: {},
      lastErrorLogAt: {},
    };

    expect(await checkRedisHealth()).toEqual({
      configured: true,
      ok: false,
      error: "unavailable",
    });
  });
});
