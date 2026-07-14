import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

type G = { __aeraRedis?: unknown };
const g = globalThis as unknown as G;

describe("rateLimit (in-memory backend)", () => {
  beforeEach(() => {
    // Kein Redis -> Memory-Pfad (Cache der Backend-Wahl zurücksetzen).
    g.__aeraRedis = null;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete g.__aeraRedis;
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
    expect(await rateLimit("a", 1, 60_000)).toBe(true);
    expect(await rateLimit("b", 1, 60_000)).toBe(true);
    expect(await rateLimit("a", 1, 60_000)).toBe(false);
    expect(await rateLimit("b", 1, 60_000)).toBe(false);
  });
});

describe("rateLimit (redis backend)", () => {
  afterEach(() => {
    delete g.__aeraRedis;
  });

  it("uses INCR + PEXPIRE and enforces the limit", async () => {
    let count = 0;
    const incr = vi.fn(async () => ++count);
    const pexpire = vi.fn(async () => 1);
    g.__aeraRedis = { incr, pexpire };

    expect(await rateLimit("rkey", 2, 60_000)).toBe(true);
    expect(await rateLimit("rkey", 2, 60_000)).toBe(true);
    expect(await rateLimit("rkey", 2, 60_000)).toBe(false);

    expect(incr).toHaveBeenCalledWith("rl:rkey");
    // PEXPIRE nur beim ersten Ereignis des Fensters.
    expect(pexpire).toHaveBeenCalledTimes(1);
    expect(pexpire).toHaveBeenCalledWith("rl:rkey", 60_000);
  });

  it("fails open when redis errors (availability over throttling)", async () => {
    g.__aeraRedis = {
      incr: vi.fn(async () => {
        throw new Error("connection lost");
      }),
      pexpire: vi.fn(),
    };
    expect(await rateLimit("rkey", 1, 60_000)).toBe(true);
  });
});
