import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: { CRON_SECRET: "cron-secret-0123456789-0123456789" },
}));

vi.mock("@/lib/env", () => ({ env: state.env }));

import { authorizeCronRequest, cronJson } from "@/lib/cron-auth";

const URL = "https://aera.so/api/cron/posts";

function request(authorization?: string, url = URL): Request {
  return new Request(url, {
    method: "POST",
    ...(authorization ? { headers: { authorization } } : {}),
  });
}

beforeEach(() => {
  state.env.CRON_SECRET = "cron-secret-0123456789-0123456789";
});

describe("central cron authentication", () => {
  it("disables cron when the configured secret is shorter than 32 characters", async () => {
    state.env.CRON_SECRET = "too-short";
    const response = authorizeCronRequest(request("Bearer too-short"));
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({ error: "cron-disabled" });
  });

  it("requires an exact bearer token", () => {
    expect(authorizeCronRequest(request())?.status).toBe(401);
    expect(authorizeCronRequest(request("Basic abc"))?.status).toBe(401);
    expect(authorizeCronRequest(request("Bearer wrong"))?.status).toBe(401);
    expect(authorizeCronRequest(request("Bearer  wrong"))?.status).toBe(401);
  });

  it("never accepts or retains a legacy query-string secret", () => {
    const secret = state.env.CRON_SECRET;
    const response = authorizeCronRequest(
      request(`Bearer ${secret}`, `${URL}?secret=${encodeURIComponent(secret)}`),
    );
    expect(response?.status).toBe(401);
  });

  it("accepts the configured bearer token using a timing-safe comparison", () => {
    expect(
      authorizeCronRequest(request(`Bearer ${state.env.CRON_SECRET}`)),
    ).toBeNull();
  });

  it("marks successful and failed cron responses as non-cacheable", () => {
    expect(cronJson({ ok: true }).headers.get("cache-control")).toContain("no-store");
    expect(authorizeCronRequest(request())?.headers.get("cache-control")).toContain(
      "no-store",
    );
  });
});
