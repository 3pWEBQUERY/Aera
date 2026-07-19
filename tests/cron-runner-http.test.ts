import { describe, expect, it, vi } from "vitest";
import {
  normalizeCronBase,
  postCronRequest,
} from "@/scripts/cron-http.mjs";

describe("Railway cron HTTP runner", () => {
  it("normalizes the configured origin and upgrades public HTTP before authentication", () => {
    expect(normalizeCronBase("aera.so/")).toBe("https://aera.so");
    expect(normalizeCronBase("http://aera.so")).toBe("https://aera.so");
    expect(normalizeCronBase("http://web.railway.internal:3000")).toBe(
      "http://web.railway.internal:3000",
    );
  });

  it("rejects APP_URL values containing credentials or paths", () => {
    expect(() => normalizeCronBase("https://user:pass@aera.so")).toThrow();
    expect(() => normalizeCronBase("https://aera.so/c/community")).toThrow();
  });

  it("preserves POST and authorization across a safe canonical redirect", async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null }> = [];
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input.toString());
      calls.push({
        url: url.toString(),
        method: init?.method ?? "GET",
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (url.hostname === "aera.so") {
        return new Response(null, {
          status: 301,
          headers: { location: "https://www.aera.so/api/cron/posts" },
        });
      }
      return Response.json({ ok: true });
    });

    const result = await postCronRequest(
      "https://aera.so/api/cron/posts",
      "a-secure-cron-secret",
      { fetchImpl },
    );

    expect(result.response.status).toBe(200);
    expect(result.redirects).toBe(1);
    expect(calls).toEqual([
      {
        url: "https://aera.so/api/cron/posts",
        method: "POST",
        authorization: "Bearer a-secure-cron-secret",
      },
      {
        url: "https://www.aera.so/api/cron/posts",
        method: "POST",
        authorization: "Bearer a-secure-cron-secret",
      },
    ]);
  });

  it.each([
    "https://attacker.example/api/cron/posts",
    "https://aera.so/collect",
  ])("never forwards the bearer secret to unsafe redirect %s", async (location) => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location },
      }),
    );

    await expect(
      postCronRequest("https://aera.so/api/cron/posts", "secret", { fetchImpl }),
    ).rejects.toThrow(/unsafe cron redirect rejected/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
