import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "Aera <noreply@aera.so>",
    APP_URL: "https://aera.so",
  },
  features: { email: true },
}));

import { sendEmail } from "@/lib/email";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({ id: "email-1" }),
    { status: 200, headers: { "content-type": "application/json" } },
  )));
});

describe("email categories", () => {
  it("adds RFC one-click unsubscribe headers only to marketing email", async () => {
    await expect(sendEmail({
      to: "member@example.com",
      subject: "News",
      html: "<p>News</p>",
      category: "marketing",
      unsubscribeUrl: "https://aera.so/api/newsletter/unsubscribe/token",
    })).resolves.toEqual({ ok: true, id: "email-1" });

    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.headers).toEqual({
      "List-Unsubscribe": "<https://aera.so/api/newsletter/unsubscribe/token>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });

    await sendEmail({
      to: "member@example.com",
      subject: "Password reset",
      html: "<p>Reset</p>",
    });
    const transactional = JSON.parse(String(
      (vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit).body,
    ));
    expect(transactional.headers).toBeUndefined();
  });

  it("refuses marketing mail without an app-owned unsubscribe URL", async () => {
    await expect(sendEmail({
      to: "member@example.com",
      subject: "News",
      html: "<p>News</p>",
      category: "marketing",
      unsubscribeUrl: "https://attacker.example/unsubscribe",
    })).resolves.toEqual({
      ok: false,
      error: "Marketing unsubscribe URL must use the configured app origin",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
