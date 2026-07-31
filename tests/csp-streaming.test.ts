import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WebRTC laeuft ueber `fetch`, nicht ueber ein iframe.
 *
 * Senden (WHIP, lib/whip.ts) und Zuschauen (WHEP) sprechen direkt mit
 * Cloudflare Stream. Fehlt die Freigabe in `connect-src`, blockiert die CSP
 * beides — und zwar still: der Browser wirft einen gewoehnlichen TypeError,
 * der in der Oberflaeche als "Sendung liess sich nicht starten" ankommt.
 * Genau dieser Fall ist einmal passiert; der Test haelt ihn fest.
 */
describe("Content-Security-Policy", () => {
  const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  const connectSrc = config
    .split("\n")
    .find((line) => line.includes("connect-src"));

  it("erlaubt WHIP/WHEP gegen Cloudflare Stream", () => {
    expect(connectSrc).toBeDefined();
    expect(connectSrc).toContain("https://*.cloudflarestream.com");
  });

  it("erlaubt weiterhin die eigene Herkunft und Stripe", () => {
    expect(connectSrc).toContain("'self'");
    expect(connectSrc).toContain("https://api.stripe.com");
  });
});
