import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withdraw: vi.fn(async () => true) }));
vi.mock("@/lib/marketing-consent", () => ({
  withdrawNewsletterConsentByToken: mocks.withdraw,
}));

import { GET, POST } from "@/app/api/newsletter/unsubscribe/[token]/route";

describe("newsletter one-click unsubscribe route", () => {
  it("keeps GET read-only and redirects people to the confirmation page", async () => {
    const response = await GET(
      new Request("https://aera.so/api/newsletter/unsubscribe/signed-token"),
      { params: Promise.resolve({ token: "signed-token" }) },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://aera.so/unsubscribe/signed-token");
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });

  it("accepts the RFC 8058 form POST without a login", async () => {
    const response = await POST(
      new Request("https://aera.so/api/newsletter/unsubscribe/signed-token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
      { params: Promise.resolve({ token: "signed-token" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.withdraw).toHaveBeenCalledWith("signed-token", "LIST_UNSUBSCRIBE_POST");
  });

  it("rejects unrelated form posts", async () => {
    const response = await POST(
      new Request("https://aera.so/api/newsletter/unsubscribe/signed-token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "confirm=yes",
      }),
      { params: Promise.resolve({ token: "signed-token" }) },
    );
    expect(response.status).toBe(400);
  });
});
