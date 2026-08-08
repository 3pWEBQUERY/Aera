import { describe, expect, it } from "vitest";
import {
  normalizeExternalUrl,
  profileUrlLabel,
  profileUrlLabelParts,
  referrerHost,
} from "@/lib/url";

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

/**
 * Die Adresse, zerlegt für die Formulare, die den Handle setzen.
 *
 * Der Test hält die eine Eigenschaft fest, an der es vorher scheiterte:
 * zusammengesetzt muss dasselbe herauskommen wie bei `profileUrlLabel`. Die
 * Formulare bauten die Adresse früher selbst aus einem Suffix und fielen dabei
 * auf „aeli.so" zurück — lokal versprachen sie damit `marie.aeli.so`, während
 * Kopfzeile und QR-Code `localhost:3001/p/marie` nannten.
 */
describe("profileUrlLabelParts", () => {
  it("ergibt zusammengesetzt dieselbe Adresse wie profileUrlLabel", () => {
    const { prefix, suffix } = profileUrlLabelParts();
    for (const handle of ["marie", "a", "sehr-langer-handle-mit-strichen"]) {
      expect(`${prefix}${handle}${suffix}`).toBe(profileUrlLabel(handle));
    }
  });

  it("legt den Handle genau einmal in die Lücke", () => {
    const { prefix, suffix } = profileUrlLabelParts();
    // Stünde der Handle schon in einem der beiden Teile, käme er doppelt
    // heraus — genau der Fehler, den eine Zerlegung per Textsuche machen kann.
    expect(prefix).not.toContain("marie");
    expect(suffix).not.toContain("marie");
    expect(prefix + suffix).not.toContain(" ");
  });
});
