import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

const getReadinessSnapshot = vi.fn();
vi.mock("@/lib/readiness", () => ({ getReadinessSnapshot }));

describe("health routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 only when every required readiness check is up", async () => {
    getReadinessSnapshot.mockResolvedValue({
      status: "ok",
      release: "abc",
      checks: {
        configuration: { status: "up" },
        database: { status: "up" },
        redis: { status: "up" },
        storage: { status: "up" },
        malwareScanner: { status: "up" },
      },
    });
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns 503 without exposing dependency errors when readiness degrades", async () => {
    getReadinessSnapshot.mockResolvedValue({
      status: "degraded",
      release: "abc",
      checks: {
        configuration: { status: "up" },
        database: { status: "down" },
        redis: { status: "up" },
        storage: { status: "up" },
        malwareScanner: { status: "up" },
      },
    });
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("error");
  });

  it("keeps process liveness independent from external services", async () => {
    const { GET } = await import("@/app/api/health/live/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("uses dependency-independent liveness for the Railway deployment gate", async () => {
    const railwayConfig = await readFile(
      new URL("../railway.toml", import.meta.url),
      "utf8",
    );

    expect(railwayConfig).toMatch(/healthcheckPath\s*=\s*"\/api\/health\/live"/);
    expect(railwayConfig).not.toMatch(/healthcheckPath\s*=\s*"\/api\/health\/ready"/);
  });
});
