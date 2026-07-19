import { afterEach, describe, expect, it, vi } from "vitest";
import { logOperationalEvent, reportError } from "@/lib/observability";

afterEach(() => vi.restoreAllMocks());

describe("structured operational logging", () => {
  it("redacts sensitive fields and URL credentials", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logOperationalEvent("error", "test", {
      authorization: "Bearer top-secret",
      database: "postgresql://admin:password@db.internal/aera",
      detail:
        "https://service.invalid/callback?token=url-secret sk_live_1234567890 whsec_1234567890 re_1234567890",
      counters: { sent: 4, nestedToken: "must-not-leak" },
    });
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).not.toContain("top-secret");
    expect(line).not.toContain("admin:password");
    expect(line).not.toContain("url-secret");
    expect(line).not.toContain("sk_live_");
    expect(line).not.toContain("whsec_");
    expect(line).not.toContain("re_123");
    expect(JSON.parse(line)).toMatchObject({
      level: "error",
      event: "test",
      counters: { sent: 4, nestedToken: "[redacted]" },
    });
  });

  it("normalizes unknown errors into a single structured record", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportError(new Error("boom"), { routePath: "/api/test" });
    const record = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(record).toMatchObject({
      event: "unhandled_request_error",
      errorName: "Error",
      errorMessage: "boom",
      routePath: "/api/test",
    });
  });
});
