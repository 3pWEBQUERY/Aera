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

    // The CSP itself is set per request with a nonce (proxy.ts, lib/csp.ts).
    expect(headers.has("Content-Security-Policy")).toBe(false);
    const { contentSecurityPolicy } = await import("../lib/csp");
    const csp = contentSecurityPolicy("dGVzdC1ub25jZQ==");
    expect(csp).toContain("'nonce-dGVzdC1ub25jZQ=='");
    expect(csp).toContain("'strict-dynamic'");
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

describe("per-request CSP from the proxy", () => {
  it("sends a fresh nonce to the app and the browser on every response", async () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "aera.test");
    vi.resetModules();
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("../proxy");
    const first = await proxy(new NextRequest("https://aera.test/pricing", { headers: { host: "aera.test" } }));
    const second = await proxy(new NextRequest("https://aera.test/pricing", { headers: { host: "aera.test" } }));

    const csp1 = first.headers.get("Content-Security-Policy") ?? "";
    const csp2 = second.headers.get("Content-Security-Policy") ?? "";
    const nonce1 = /'nonce-([^']+)'/.exec(csp1)?.[1];
    const nonce2 = /'nonce-([^']+)'/.exec(csp2)?.[1];
    expect(nonce1).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
    // Next reads the nonce from the forwarded request header.
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(csp1);
  });
});
