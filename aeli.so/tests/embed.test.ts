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
