import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, parseTheme, readableOn, resolveTheme, THEME_PRESETS } from "@/lib/themes";

/**
 * `AeliProfile.theme` ist eine Json-Spalte: dort kann mit der Zeit alles
 * stehen — ein altes Feld, ein halb gespeicherter Entwurf, ein Wert aus einer
 * früheren Version. Eine Bio-Seite darf deswegen nie weiß bleiben.
 */
describe("parseTheme", () => {
  it("fällt bei Unsinn auf das Standard-Preset zurück", () => {
    for (const input of [null, undefined, {}, { preset: "gibtsnicht" }, "kaputt", 42]) {
      expect(parseTheme(input).preset).toBe(DEFAULT_THEME.preset);
    }
  });

  it("wirft Werte weg, die nicht in die CSS-Variablen dürfen", () => {
    const theme = parseTheme({
      preset: "neon",
      accent: "red; background: url(evil)",
      buttonStyle: "wackeln",
      corner: "beliebig",
      fontPair: "comic",
      backdrop: "explosion",
    });
    expect(theme.preset).toBe("neon");
    expect(theme.accent).toBeUndefined();
    expect(theme.buttonStyle).toBeUndefined();
    expect(theme.corner).toBeUndefined();
    expect(theme.fontPair).toBeUndefined();
    expect(theme.backdrop).toBeUndefined();
  });

  it("behält gültiges Feintuning", () => {
    const theme = parseTheme({ preset: "papier", accent: "#FF00AA", corner: "pill" });
    expect(theme.accent).toBe("#ff00aa");
    expect(theme.corner).toBe("pill");
  });
});

describe("resolveTheme", () => {
  it("berechnet die Schriftfarbe auf dem Knopf statt sie zu raten", () => {
    // Auf Gelb gehört Schwarz, auf Dunkelblau Weiß — sonst ist der Knopf
    // beschriftet, aber nicht lesbar.
    expect(resolveTheme({ preset: "papier", accent: "#ffe400" }).accentFg).toBe("#111111");
    expect(resolveTheme({ preset: "papier", accent: "#101a4d" }).accentFg).toBe("#ffffff");
  });

  it("liefert für jedes Preset vollständige Werte", () => {
    for (const preset of THEME_PRESETS) {
      const theme = resolveTheme({ preset: preset.key });
      expect(theme.radius, preset.key).toMatch(/^\d+px$|^999px$/);
      expect(theme.fontBody.length, preset.key).toBeGreaterThan(0);
      expect(theme.accentFg, preset.key).toMatch(/^#/);
    }
  });
});

describe("readableOn", () => {
  it("entscheidet auch bei den kniffligen Farben richtig", () => {
    expect(readableOn("#ffffff")).toBe("#111111");
    expect(readableOn("#000000")).toBe("#ffffff");
    // Limette und Cyan sind hell, obwohl eine reine Helligkeitsrechnung sie
    // gern für mittel hält.
    expect(readableOn("#c9f24d")).toBe("#111111");
    expect(readableOn("#00ffff")).toBe("#111111");
  });
});
