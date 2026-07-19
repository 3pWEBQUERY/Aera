import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";

const redisMocks = vi.hoisted(() => ({
  getRedisCommandClient: vi.fn(),
  isRedisConfigured: vi.fn(),
}));

vi.mock("@/lib/redis", () => redisMocks);

import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit (in-memory backend)", () => {
  beforeEach(() => {
    redisMocks.getRedisCommandClient.mockResolvedValue(null);
    redisMocks.isRedisConfigured.mockReturnValue(false);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("allows up to the limit and blocks beyond it", async () => {
    const key = `t:${Math.random()}`;
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(false);
  });

  it("resets after the window elapses", async () => {
    const key = `t:${Math.random()}`;
    expect(await rateLimit(key, 1, 60_000)).toBe(true);
    expect(await rateLimit(key, 1, 60_000)).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(await rateLimit(key, 1, 60_000)).toBe(true);
  });

  it("tracks separate keys independently", async () => {
    const suffix = Math.random();
    expect(await rateLimit(`a:${suffix}`, 1, 60_000)).toBe(true);
    expect(await rateLimit(`b:${suffix}`, 1, 60_000)).toBe(true);
    expect(await rateLimit(`a:${suffix}`, 1, 60_000)).toBe(false);
    expect(await rateLimit(`b:${suffix}`, 1, 60_000)).toBe(false);
  });
});

describe("rateLimit (redis backend)", () => {
  beforeEach(() => {
    redisMocks.isRedisConfigured.mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("uses an atomic Lua counter and enforces the limit", async () => {
    let count = 0;
    const evalCommand = vi.fn(async (..._args: unknown[]) => ++count);
    redisMocks.getRedisCommandClient.mockResolvedValue({ eval: evalCommand });

    expect(await rateLimit("rkey", 2, 60_000)).toBe(true);
    expect(await rateLimit("rkey", 2, 60_000)).toBe(true);
    expect(await rateLimit("rkey", 2, 60_000)).toBe(false);

    expect(evalCommand).toHaveBeenCalledTimes(3);
    expect(evalCommand.mock.calls[0]?.[1]).toBe(1);
    expect(evalCommand.mock.calls[0]?.[2]).toBe(
      `aera:rl:v1:${createHash("sha256").update("rkey").digest("hex")}`,
    );
    expect(evalCommand.mock.calls[0]?.[3]).toBe(60_000);
  });

  it("degrades to a conservative local limit instead of failing open", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    redisMocks.getRedisCommandClient.mockResolvedValue({
      eval: vi.fn(async () => {
        throw new Error("connection lost");
      }),
    });
    const key = `degraded:${Math.random()}`;

    // Half of the configured limit (ceil(3 / 2)) is available per instance.
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(false);
  });

  it("also throttles locally when a configured client cannot initialize", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    redisMocks.getRedisCommandClient.mockResolvedValue(null);
    const key = `missing-client:${Math.random()}`;

    expect(await rateLimit(key, 2, 60_000)).toBe(true);
    expect(await rateLimit(key, 2, 60_000)).toBe(false);
  });
});
