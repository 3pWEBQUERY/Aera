import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "aera.so");
  vi.stubEnv("APP_URL", "https://aera.so");
  vi.stubEnv("DOMAIN_RESOLVER_ORIGIN", "https://internal.aera.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("host-based proxy security", () => {
  it("uses only the configured resolver origin, never the request Host", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ slug: "safe-community" }));
    vi.stubGlobal("fetch", fetchMock);

    await proxy(
      new NextRequest("https://attacker.example/s/news", {
        headers: { host: "169.254.169.254" },
      }),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const target = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(target.origin).toBe("https://internal.aera.test");
    expect(target.pathname).toBe("/api/resolve-domain");
    expect(target.searchParams.get("host")).toBe("169.254.169.254");
    expect(target.hostname).not.toBe("169.254.169.254");
  });

  it("fails closed without a trusted configured origin", async () => {
    vi.stubEnv("DOMAIN_RESOLVER_ORIGIN", "");
    vi.stubEnv("APP_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(
      new NextRequest("https://unknown.example/path", {
        headers: { host: "unknown.example" },
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects an invalid resolver slug before constructing a rewrite path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ slug: "../admin" })));

    const response = await proxy(
      new NextRequest("https://invalid-slug.example/path", {
        headers: { host: "invalid-slug.example" },
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("never routes an unresolved platform subdomain to a same-named slug", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ slug: null })));

    const response = await proxy(
      new NextRequest("https://reserved.aera.so/path", {
        headers: { host: "reserved.aera.so" },
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it.each([
    "/login",
    "/member/account",
    "/legal/accept",
    "/agb",
    "/datenschutz",
    "/widerruf",
    "/unsubscribe/token",
  ])("keeps the global route %s available on community domains", async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(
      new NextRequest(`https://creator.example${path}`, {
        headers: { host: "creator.example" },
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("still rewrites actual community content on a verified custom domain", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ slug: "safe-community" })),
    );

    const response = await proxy(
      new NextRequest("https://verified-community.example/s/news", {
        headers: { host: "verified-community.example" },
      }),
    );

    expect(response.headers.get("x-middleware-rewrite")).toContain(
      "/c/safe-community/s/news",
    );
  });
});
