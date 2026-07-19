import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  releaseExpired: vi.fn(),
  runCronRoute: vi.fn(),
  cronSecret: "cron-secret-0123456789-0123456789",
}));

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: mocks.cronSecret } }));
vi.mock("@/lib/product-inventory", () => ({
  releaseExpiredProductReservations: mocks.releaseExpired,
}));
vi.mock("@/lib/cron-monitor", () => ({ runCronRoute: mocks.runCronRoute }));

import { GET, POST } from "@/app/api/cron/inventory/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.releaseExpired.mockResolvedValue({ scanned: 2, released: 1 });
  mocks.runCronRoute.mockImplementation(
    async (_job: string, handler: (context: { deadlineAt: number }) => Promise<object>) =>
      Response.json(
        { ok: true, ...(await handler({ deadlineAt: Date.now() + 40_000 })) },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      ),
  );
});

describe("inventory reservation cron", () => {
  it("rejects unauthenticated calls", async () => {
    const response = await POST(
      new Request("https://aera.so/api/cron/inventory", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.releaseExpired).not.toHaveBeenCalled();
  });

  it("rejects the legacy query-string secret", async () => {
    const response = await POST(
      new Request(
        `https://aera.so/api/cron/inventory?secret=${encodeURIComponent(mocks.cronSecret)}`,
        { method: "POST" },
      ),
    );
    expect(response.status).toBe(401);
    expect(mocks.releaseExpired).not.toHaveBeenCalled();
  });

  it("accepts a bearer secret and releases stale reservations", async () => {
    const response = await POST(
      new Request("https://aera.so/api/cron/inventory", {
        method: "POST",
        headers: { authorization: `Bearer ${mocks.cronSecret}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      scanned: 2,
      released: 1,
    });
    expect(mocks.releaseExpired).toHaveBeenCalledWith(
      200,
      expect.any(Date),
      { deadlineAt: expect.any(Number) },
    );
  });

  it("does not execute state-changing work over GET", async () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.releaseExpired).not.toHaveBeenCalled();
  });
});
