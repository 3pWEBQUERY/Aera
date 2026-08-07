import { describe, expect, it } from "vitest";
import { checkHandle, handleSuggestions, isValidHandle, normalizeHandle } from "@/lib/handle";

/**
 * Der Handle ist Adresse und Identität in einem. Was hier durchrutscht, steht
 * anschließend als Subdomain im Netz — deshalb prüft dieser Test vor allem die
 * Fälle, die man einmal übersieht und dann nicht mehr zurückholen kann.
 */
describe("normalizeHandle", () => {
  it("schreibt Umlaute aus, statt sie wegzuwerfen", () => {
    // „muller" wäre für Frau Müller kein Name mehr, sondern ein Tippfehler.
    expect(normalizeHandle("Müller")).toBe("mueller");
    expect(normalizeHandle("Größe")).toBe("groesse");
  });

  it("macht aus einem Namen mit Leerzeichen einen Handle", () => {
    expect(normalizeHandle("Marie Lang")).toBe("marie-lang");
  });

  it("legt keine doppelten oder randständigen Bindestriche an", () => {
    expect(normalizeHandle("--marie--lang--")).toBe("marie-lang");
    expect(normalizeHandle("a  b")).toBe("a-b");
  });

  it("kürzt auf die erlaubte Länge", () => {
    expect(normalizeHandle("x".repeat(80))).toHaveLength(30);
  });
});

describe("checkHandle", () => {
  it("nimmt gültige Handles an", () => {
    for (const handle of ["marie", "marie-lang", "dj-42", "a1b"]) {
      expect(checkHandle(handle), handle).toBeNull();
    }
  });

  it("weist reservierte Labels ab", () => {
    // `login.aeli.so` in einer Nachricht sieht aus wie unsere Anmeldeseite —
    // genau darum steht diese Liste überhaupt.
    for (const handle of ["login", "admin", "www", "api", "aeli", "support"]) {
      expect(checkHandle(handle), handle).toBe("reserved");
    }
  });

  it("weist ab, was in einer Adresszeile täuschen kann", () => {
    expect(checkHandle("xn--abc")).toBe("doubleDash");
    expect(checkHandle("12345")).toBe("numericOnly");
    expect(checkHandle("-marie")).toBe("edges");
    expect(checkHandle("marie_lang")).toBe("charset");
    expect(checkHandle("ab")).toBe("tooShort");
    expect(checkHandle("x".repeat(31))).toBe("tooLong");
  });
});

describe("handleSuggestions", () => {
  it("schlägt nur Handles vor, die auch durch die Prüfung kämen", () => {
    for (const suggestion of handleSuggestions("Marie Lang")) {
      expect(isValidHandle(suggestion), suggestion).toBe(true);
    }
  });

  it("bleibt auch bei einem sehr langen Namen im Rahmen", () => {
    for (const suggestion of handleSuggestions("x".repeat(60))) {
      expect(suggestion.length).toBeLessThanOrEqual(30);
    }
  });

  it("liefert etwas Brauchbares, auch wenn nichts Verwertbares reinkommt", () => {
    expect(handleSuggestions("!!!").length).toBeGreaterThan(0);
  });
});
