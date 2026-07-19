import { describe, expect, it, vi } from "vitest";
import {
  classifyCronRequestError,
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
    expect(() => normalizeCronBase("https://*.aera.so")).toThrow(
      /one concrete Railway web-service domain/,
    );
    expect(() =>
      normalizeCronBase("https://${{Aera.RAILWAY_PUBLIC_DOMAIN}}"),
    ).toThrow();
  });

  it("reports nested network causes without exposing their messages", () => {
    const secret = "must-never-appear-in-cron-diagnostics";
    const diagnosis = classifyCronRequestError(
      new TypeError("fetch failed", {
        cause: Object.assign(new Error(`lookup failed for ${secret}`), {
          code: "ENOTFOUND",
        }),
      }),
    );

    expect(diagnosis).toEqual({
      category: "dns",
      codes: ["ENOTFOUND"],
      retryable: false,
    });
    expect(JSON.stringify(diagnosis)).not.toContain(secret);
    expect(
      classifyCronRequestError(
        Object.assign(new Error("untrusted"), { code: "SECRET_VALUE" }),
      ),
    ).toEqual({ category: "unknown", codes: [], retryable: false });
  });

  it("collects AggregateError causes and prioritizes aborts", () => {
    const diagnosis = classifyCronRequestError(
      new AggregateError([
        Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
        Object.assign(new Error("cancelled"), { code: "ABORT_ERR" }),
      ]),
    );

    expect(diagnosis.category).toBe("aborted");
    expect(diagnosis.codes).toEqual(["ECONNRESET", "ABORT_ERR"]);
    expect(diagnosis.retryable).toBe(false);
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

  it("retries one transient network failure and preserves authorization", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("socket reset"), { code: "ECONNRESET" }),
        }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const result = await postCronRequest(
      "https://aera.so/api/cron/webhooks",
      "a-secure-cron-secret",
      { fetchImpl, retryDelayMs: 0 },
    );

    expect(result.response.status).toBe(200);
    expect(result.networkRetries).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer a-secure-cron-secret",
      );
    }
  });

  it("does not retry DNS configuration, TLS, or aborted requests", async () => {
    const errors = [
      Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("not found"), { code: "ENOTFOUND" }),
      }),
      Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("certificate mismatch"), {
          code: "ERR_TLS_CERT_ALTNAME_INVALID",
        }),
      }),
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    ];

    for (const error of errors) {
      const fetchImpl = vi.fn().mockRejectedValue(error);
      await expect(
        postCronRequest("https://aera.so/api/cron/webhooks", "secret", {
          fetchImpl,
          retryDelayMs: 0,
        }),
      ).rejects.toBe(error);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    "https://attacker.example/api/cron/posts",
    "https://aera.so:4443/api/cron/posts",
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
