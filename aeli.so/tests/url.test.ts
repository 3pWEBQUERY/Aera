import { describe, expect, it } from "vitest";
import { normalizeExternalUrl, referrerHost } from "@/lib/url";

/**
 * Jedes Link-Ziel auf einer Bio-Seite kommt aus einem Textfeld. Was diese
 * Funktion durchlässt, landet ungefiltert in einem `href` — der Test ist
 * deshalb vor allem eine Liste dessen, was NICHT durchkommen darf.
 */
describe("normalizeExternalUrl", () => {
  it("ergänzt das fehlende Schema", () => {
    expect(normalizeExternalUrl("instagram.com/marie")).toBe("https://instagram.com/marie");
  });

  it("lässt mailto und tel durch", () => {
    expect(normalizeExternalUrl("mailto:hallo@example.com")).toBe("mailto:hallo@example.com");
    expect(normalizeExternalUrl("tel:+4930123456")).toBe("tel:+4930123456");
  });

  it("verwirft Schemata, die Code ausführen würden", () => {
    // eslint-disable-next-line no-script-url -- genau das ist der Testfall
    expect(normalizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normalizeExternalUrl("vbscript:msgbox(1)")).toBeNull();
  });

  it("verwirft Ziele ohne öffentlichen Host", () => {
    expect(normalizeExternalUrl("http://localhost:3000")).toBeNull();
    expect(normalizeExternalUrl("http://intranet")).toBeNull();
  });

  it("verwirft Leeres", () => {
    expect(normalizeExternalUrl("   ")).toBeNull();
  });
});

describe("referrerHost", () => {
  it("behält nur den Host, nie den Pfad", () => {
    expect(referrerHost("https://www.instagram.com/marie/reel/123?x=y")).toBe("instagram.com");
  });

  it("kommt mit fehlendem oder kaputtem Referrer klar", () => {
    expect(referrerHost(null)).toBeNull();
    expect(referrerHost("kein-url")).toBeNull();
  });
});
