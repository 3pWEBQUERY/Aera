import { describe, expect, it } from "vitest";
import { resolveEmbed } from "@/lib/embed";

/**
 * Die Allowlist ist der Grund, warum ein EMBED-Block keine offene Bühne für
 * fremde Skripte ist. Dieser Test hält beide Seiten fest: dass die erlaubten
 * Anbieter erkannt werden — und dass alles andere `null` ergibt.
 */
describe("resolveEmbed", () => {
  it("erkennt YouTube in allen gebräuchlichen Schreibweisen", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "youtube.com/embed/dQw4w9WgXcQ",
    ]) {
      const embed = resolveEmbed(url);
      expect(embed?.provider, url).toBe("youtube");
      // Immer die cookiefreie Variante: der Player setzt erst beim Abspielen.
      expect(embed?.src).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    }
  });

  it("gibt Spotify die Höhe, die zum Inhalt passt", () => {
    expect(resolveEmbed("https://open.spotify.com/track/abc123")?.fixedHeight).toBe(152);
    expect(resolveEmbed("https://open.spotify.com/playlist/abc123")?.fixedHeight).toBe(352);
  });

  it("verwirft alles, was nicht auf der Liste steht", () => {
    for (const url of [
      "https://example.com/video",
      "https://evil.example/player?src=x",
      // Sieht aus wie YouTube, ist es aber nicht.
      "https://youtube.com.evil.example/watch?v=abc",
      "nicht mal eine url",
      "",
    ]) {
      expect(resolveEmbed(url), url).toBeNull();
    }
  });

  it("baut nur Adressen mit unverdächtiger ID", () => {
    expect(resolveEmbed("https://www.youtube.com/watch?v=../../etc")).toBeNull();
  });
});

/**
 * Der Telefonrahmen der Vorschau skaliert die Seite. Wie er das tut, ist für
 * Einbettungen keine Geschmacksfrage: `zoom` verändert, was `window.innerWidth`
 * innerhalb eines iframes meldet, und Player wie YouTube bauen sich danach auf.
 * Das Ergebnis war ein weißer Streifen rechts und unten, genau so breit wie der
 * Verkleinerungsfaktor. `transform` fasst die Innenmaße nicht an.
 *
 * Der Test liest das CSS, weil es dafür keine andere Stelle gibt — und weil der
 * Rückweg zu `zoom` naheliegt: es ist die kürzere Zeile.
 */
describe("Telefonrahmen der Vorschau", () => {
  it("skaliert mit transform, nicht mit zoom", async () => {
    const { readFile } = await import("node:fs/promises");
    const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
    const rule = css.match(/\.aeli-phone-screen\s*\{[^}]*\}/)?.[0];
    expect(rule, ".aeli-phone-screen fehlt in globals.css").toBeTruthy();
    expect(rule).toContain("transform: scale(var(--phone-zoom");
    expect(rule).not.toMatch(/^\s*zoom:/m);
  });
});
