import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLOG_CATEGORIES,
  blogSlug,
  excerptFrom,
  freeBlogSlug,
  isBlogCategory,
  isScheduled,
  localeChain,
  parseCategory,
  publicPostWhere,
  readingMinutes,
} from "@/lib/blog";
import { sanitizeRichHtml, htmlToPlainText } from "@/lib/rich-text";

const ROOT = join(import.meta.dirname, "..");

describe("Adressen von Blogbeiträgen", () => {
  it("schreibt deutsche Umlaute aus, statt sie wegzuwerfen", () => {
    // Das ist der ganze Grund für eine eigene Funktion neben `slugify`: die
    // allgemeine würde hier „gro-e" und „stra-e" erzeugen.
    expect(blogSlug("Größe")).toBe("groesse");
    expect(blogSlug("Straße")).toBe("strasse");
    expect(blogSlug("Über uns")).toBe("ueber-uns");
    expect(blogSlug("Ölwechsel")).toBe("oelwechsel");
  });

  it("macht aus einer Überschrift eine lesbare Adresse", () => {
    expect(blogSlug("Was ist neu im August 2026?")).toBe("was-ist-neu-im-august-2026");
    expect(blogSlug("  Doppelte   Leerzeichen  ")).toBe("doppelte-leerzeichen");
    expect(blogSlug("Emoji 🎉 raus")).toBe("emoji-raus");
  });

  it("endet nie auf einem Bindestrich, auch nicht nach dem Kürzen", () => {
    const long = blogSlug("a".repeat(78) + " und noch viel mehr Text dahinter");
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("-")).toBe(false);
    expect(blogSlug("Ende!!!")).toBe("ende");
  });

  it("hängt einen Zähler an, statt eine belegte Adresse abzulehnen", () => {
    expect(freeBlogSlug([], "Was neu ist")).toBe("was-neu-ist");
    expect(freeBlogSlug(["was-neu-ist"], "Was neu ist")).toBe("was-neu-ist-2");
    expect(freeBlogSlug(["was-neu-ist", "was-neu-ist-2"], "Was neu ist")).toBe("was-neu-ist-3");
  });

  it("liefert auch für einen Titel ohne verwertbare Zeichen etwas", () => {
    expect(freeBlogSlug([], "🎉🎉🎉")).toBe("beitrag");
  });
});

describe("Lesezeit und Anriss", () => {
  it("rechnet mindestens eine Minute, auch für einen Satz", () => {
    expect(readingMinutes("Kurz.")).toBe(1);
    expect(readingMinutes("")).toBe(1);
  });

  it("rechnet mit 200 Wörtern pro Minute", () => {
    expect(readingMinutes(Array(400).fill("wort").join(" "))).toBe(2);
    expect(readingMinutes(Array(1000).fill("wort").join(" "))).toBe(5);
  });

  it("schneidet den Anriss an der Wortgrenze ab", () => {
    const text = "Wir haben die Bezahlvorgänge in Aera von Grund auf überarbeitet.";
    const cut = excerptFrom(text, 30);
    expect(cut.endsWith("…")).toBe(true);
    // Kein abgeschnittenes Wort vor den Auslassungspunkten.
    expect(text.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut.slice(0, -1).endsWith(" ")).toBe(false);
  });

  it("lässt kurzen Text unangetastet", () => {
    expect(excerptFrom("Kurz und gut.", 200)).toBe("Kurz und gut.");
  });
});

describe("Sichtbarkeit", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("veröffentlicht heißt: Status, Datum gesetzt und Datum erreicht", () => {
    // Alle drei Bedingungen zusammen — fällt eine weg, erscheinen geplante
    // Beiträge zu früh.
    expect(publicPostWhere(now)).toEqual({
      status: "PUBLISHED",
      publishedAt: { not: null, lte: now },
    });
  });

  it("erkennt einen geplanten Beitrag", () => {
    const future = new Date("2026-09-01T09:00:00.000Z");
    const past = new Date("2026-08-01T09:00:00.000Z");
    expect(isScheduled({ status: "PUBLISHED", publishedAt: future }, now)).toBe(true);
    expect(isScheduled({ status: "PUBLISHED", publishedAt: past }, now)).toBe(false);
    expect(isScheduled({ status: "DRAFT", publishedAt: future }, now)).toBe(false);
    expect(isScheduled({ status: "PUBLISHED", publishedAt: null }, now)).toBe(false);
  });
});

describe("Rubriken und Sprachen", () => {
  it("nimmt nur bekannte Rubriken an", () => {
    expect(parseCategory("produkt")).toBe("produkt");
    expect(parseCategory("gibt-es-nicht")).toBeNull();
    expect(parseCategory(null)).toBeNull();
    expect(parseCategory(42)).toBeNull();
    for (const key of BLOG_CATEGORIES) expect(isBlogCategory(key)).toBe(true);
  });

  it("jede Rubrik ist selbst eine gültige Adresse", () => {
    // Die Schlüssel stehen in der URL (?rubrik=…) — was dort nicht heil
    // durchkommt, gehört nicht in die Liste.
    for (const key of BLOG_CATEGORIES) expect(blogSlug(key)).toBe(key);
  });

  it("fällt von der aktiven Sprache auf Englisch und dann Deutsch zurück", () => {
    expect(localeChain("fr")).toEqual(["fr", "en", "de"]);
    expect(localeChain("en")).toEqual(["en", "de"]);
    expect(localeChain("de")).toEqual(["de", "en"]);
  });
});

describe("Der Text eines Beitrags", () => {
  it("wird beim Speichern von ausführbarem Inhalt befreit", () => {
    const dirty =
      '<p>Hallo</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>' +
      '<img src="x" onerror="alert(1)">';
    const clean = sanitizeRichHtml(dirty);
    expect(clean).toContain("<p>Hallo</p>");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("onerror");
  });

  it("behält, was ein Beitrag wirklich braucht", () => {
    const clean = sanitizeRichHtml(
      '<h2>Überschrift</h2><p><strong>fett</strong></p><ul><li>eins</li></ul>' +
        '<blockquote>Zitat</blockquote><img src="/api/platform-media/blog/a.png" alt="Bild">',
    );
    expect(clean).toContain("<h2>Überschrift</h2>");
    expect(clean).toContain("<strong>fett</strong>");
    expect(clean).toContain("<li>eins</li>");
    expect(clean).toContain("<blockquote>Zitat</blockquote>");
    expect(clean).toContain('src="/api/platform-media/blog/a.png"');
  });

  it("ein Beitrag, der nur aus einem Script besteht, ist leer", () => {
    // Genau darauf beruht die Prüfung in savePostAction: erst bereinigen,
    // dann fragen, ob noch Text übrig ist.
    expect(htmlToPlainText(sanitizeRichHtml("<script>alert(1)</script>"))).toBe("");
  });
});

/**
 * Der Blog wird ausschließlich im Admin-Bereich geschrieben.
 *
 * Eine Server-Action ist ein Endpunkt: wer ihre Kennung kennt, kann sie
 * aufrufen, ohne je die Oberfläche gesehen zu haben. Dass die Navigation den
 * Punkt nur Admins zeigt, ist deshalb keine Absicherung. Dieser Test liest den
 * Quelltext, weil genau das die Zusicherung ist, die niemand versehentlich
 * entfernen können soll.
 */
describe("Blog-Aktionen sind Admins vorbehalten", () => {
  const source = readFileSync(join(ROOT, "app/actions/platform-blog.ts"), "utf8");
  const exported = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);

  it("es gibt überhaupt Aktionen zu prüfen", () => {
    expect(exported.length).toBeGreaterThanOrEqual(5);
  });

  for (const name of exported) {
    it(`${name} verlangt requirePlatformAdmin()`, () => {
      const body = source.slice(source.indexOf(`export async function ${name}`));
      const end = body.indexOf("\nexport ", 1);
      expect(
        (end === -1 ? body : body.slice(0, end)).includes("await requirePlatformAdmin()"),
      ).toBe(true);
    });
  }

  it("der Beitragstext läuft durch den Bereiniger, bevor er gespeichert wird", () => {
    expect(source).toContain("sanitizeRichHtml(field(form, \"bodyHtml\"");
  });
});
