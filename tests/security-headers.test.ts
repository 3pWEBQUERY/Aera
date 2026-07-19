import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production security headers", () => {
  it("ships CSP, clickjacking, MIME, permissions and HTTPS protections", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const config = (await import("../next.config")).default;
    const rules = await config.headers?.();
    const headers = new Map(
      (rules?.[0]?.headers ?? []).map((header) => [header.key, header.value]),
    );

    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Permissions-Policy")).toContain("geolocation=()");
    expect(headers.get("Strict-Transport-Security")).toBe("max-age=63072000");
  });
});
