import { describe, expect, it } from "vitest";
import {
  gradientCss,
  parseBackground,
  parseTheme,
  resolveTheme,
  themeFingerprint,
  GRADIENT_PRESETS,
} from "@/lib/themes";

/**
 * Der Hintergrund ist der Teil des Themes, in dem ein Creator wirklich frei
 * ist — und damit der, der die Seite am ehesten unlesbar machen könnte. Diese
 * Tests halten fest, was trotzdem gilt: nichts Fremdes kommt in die CSS-Werte,
 * und die Schriftfarbe wird immer berechnet.
 */

describe("parseBackground", () => {
  it("nimmt die vier Arten an", () => {
    expect(parseBackground({ kind: "preset" })).toEqual({ kind: "preset" });
    expect(parseBackground({ kind: "solid", color: "#AABBCC" })).toEqual({
      kind: "solid",
      color: "#aabbcc",
    });
  });

  it("verwirft alles, was keine echte Farbe ist", () => {
    // Der Wert landet in einem inline `style` — hier ist die Grenze zwischen
    // „eigener Hintergrund" und „fremde CSS-Deklaration auf der Seite".
    for (const color of ["red; background: url(evil)", "rgb(1,2,3)", "url(x)", "", "#12"]) {
      expect(parseBackground({ kind: "solid", color }), color).toBeUndefined();
    }
  });

  it("braucht mindestens zwei gültige Stopps für einen Verlauf", () => {
    expect(parseBackground({ kind: "gradient", stops: [{ color: "#fff", at: 0 }] })).toBeUndefined();
    expect(
      parseBackground({ kind: "gradient", stops: [{ color: "#fff", at: 0 }, { color: "kaputt", at: 100 }] }),
    ).toBeUndefined();
  });

  it("sortiert Stopps und hält Werte in ihren Grenzen", () => {
    const parsed = parseBackground({
      kind: "gradient",
      angle: 900,
      stops: [
        { color: "#000", at: 400 },
        { color: "#fff", at: -50 },
      ],
    });
    expect(parsed).toEqual({
      kind: "gradient",
      style: "linear",
      angle: 360,
      stops: [
        { color: "#ffffff", at: 0 },
        { color: "#000000", at: 100 },
      ],
    });
  });

  it("lässt nur eigene oder https-Bilder zu", () => {
    expect(parseBackground({ kind: "image", url: "/api/media/aeli/u/bg.webp" })).toMatchObject({
      kind: "image",
      url: "/api/media/aeli/u/bg.webp",
    });
    for (const url of ["javascript:alert(1)", "data:image/svg+xml,<svg/>", "http://example.com/x.jpg", ""]) {
      expect(parseBackground({ kind: "image", url }), url).toBeUndefined();
    }
  });

  it("begrenzt Unschärfe und Abdunklung", () => {
    expect(parseBackground({ kind: "image", url: "/api/media/a", blur: 999, dim: 9 })).toMatchObject({
      blur: 40,
      dim: 0.85,
    });
  });

  it("fällt bei unbekannter Art auf nichts zurück", () => {
    expect(parseBackground({ kind: "video", url: "x" })).toBeUndefined();
    expect(parseBackground("kaputt")).toBeUndefined();
  });
});

describe("gradientCss", () => {
  it("baut für jede Form einen gültigen CSS-Wert", () => {
    for (const preset of GRADIENT_PRESETS) {
      const css = gradientCss(preset.value);
      expect(css, preset.label).toMatch(/^(linear|radial|conic)-gradient\(/);
      // Keine unerwarteten Zeichen: alles kommt aus geprüften Hex-Werten.
      expect(css, preset.label).not.toMatch(/[;{}]/);
    }
  });
});

describe("resolveTheme mit eigenem Hintergrund", () => {
  it("setzt helle Schrift auf eine dunkle Fläche", () => {
    const theme = resolveTheme(parseTheme({ preset: "papier", background: { kind: "solid", color: "#08080b" } }));
    expect(theme.isDark).toBe(true);
    expect(theme.fg).toBe("#f7f7f5");
  });

  it("setzt dunkle Schrift auf eine helle Fläche — auch bei dunklem Preset", () => {
    // „Mitternacht" bringt weiße Schrift mit. Auf einer weißen Fläche wäre das
    // eine leere Seite; genau deshalb rechnet der Resolver neu.
    const theme = resolveTheme(parseTheme({ preset: "mitternacht", background: { kind: "solid", color: "#fbfbf7" } }));
    expect(theme.isDark).toBe(false);
    expect(theme.fg).toBe("#141414");
  });

  it("mittelt einen Verlauf für die Kontrastentscheidung", () => {
    const dark = resolveTheme(
      parseTheme({
        preset: "papier",
        background: { kind: "gradient", stops: [{ color: "#000000", at: 0 }, { color: "#222244", at: 100 }] },
      }),
    );
    expect(dark.isDark).toBe(true);
  });

  it("respektiert eine ausdrückliche Wahl gegen die Rechnung", () => {
    const theme = resolveTheme(
      parseTheme({ preset: "papier", background: { kind: "solid", color: "#08080b" }, textTone: "dark" }),
    );
    expect(theme.isDark).toBe(false);
  });

  it("lässt das Preset unangetastet, solange kein eigener Hintergrund gesetzt ist", () => {
    const theme = resolveTheme(parseTheme({ preset: "papier" }));
    expect(theme.fg).toBe("#1c1a16");
    expect(theme.backgroundImage).toBeNull();
  });

  it("nimmt bei einem Foto helle Schrift an", () => {
    const theme = resolveTheme(
      parseTheme({ preset: "papier", background: { kind: "image", url: "/api/media/a", dim: 0.4 } }),
    );
    expect(theme.isDark).toBe(true);
    expect(theme.backgroundImage).toMatchObject({ dim: 0.4 });
  });
});

describe("themeFingerprint", () => {
  it("ignoriert die Schlüsselreihenfolge", () => {
    const a = { preset: "neon" as const, accent: "#ffffff", backdrop: "none" as const };
    const b = { backdrop: "none" as const, accent: "#ffffff", preset: "neon" as const };
    expect(themeFingerprint(a)).toBe(themeFingerprint(b));
  });

  it("ignoriert nicht gesetzte Felder", () => {
    expect(themeFingerprint({ preset: "neon", accent: undefined })).toBe(
      themeFingerprint({ preset: "neon" }),
    );
  });

  it("bemerkt eine echte Änderung — auch tief im Verlauf", () => {
    const base = parseTheme({
      preset: "neon",
      background: { kind: "gradient", stops: [{ color: "#000000", at: 0 }, { color: "#ffffff", at: 100 }] },
    });
    const changed = parseTheme({
      preset: "neon",
      background: { kind: "gradient", stops: [{ color: "#000000", at: 0 }, { color: "#fefefe", at: 100 }] },
    });
    expect(themeFingerprint(base)).not.toBe(themeFingerprint(changed));
  });
});
