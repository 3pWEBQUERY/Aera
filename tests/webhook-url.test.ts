import { describe, expect, it } from "vitest";
import { __test, isBlockedWebhookAddress, validateWebhookUrl } from "@/lib/webhook-url";

describe("outgoing webhook SSRF protection", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "169.254.169.254", "172.20.1.1", "192.168.1.1",
    "0.0.0.0", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1",
    "64:ff9b::a9fe:a9fe",
  ])("blocks private address %s", (address) => {
    expect(isBlockedWebhookAddress(address)).toBe(true);
  });

  it("allows a public address", () => {
    expect(isBlockedWebhookAddress("1.1.1.1")).toBe(false);
    expect(isBlockedWebhookAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks a public hostname when any DNS answer is private", async () => {
    const result = await validateWebhookUrl("https://hooks.example.com/aera", {
      lookup: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a resolvable public HTTPS URL and normalizes it", async () => {
    const result = await validateWebhookUrl("https://hooks.example.com/aera", {
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
    });
    expect(result).toEqual({ ok: true, url: "https://hooks.example.com/aera" });
  });

  it("returns one validated IP for a DNS-pinned connection while retaining SNI", async () => {
    const result = await __test.resolveWebhookTarget("https://hooks.example.com/aera", {
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
    });
    expect(result).toMatchObject({
      ok: true,
      target: {
        address: "1.1.1.1",
        family: 4,
        servername: "hooks.example.com",
      },
    });
  });

  it("rejects localhost names, credentials and non-HTTPS production targets", async () => {
    expect((await validateWebhookUrl("https://localhost/hook")).ok).toBe(false);
    expect((await validateWebhookUrl("https://user:pass@example.com/hook")).ok).toBe(false);
    expect((await validateWebhookUrl("http://example.com/hook")).ok).toBe(false);
  });
});
