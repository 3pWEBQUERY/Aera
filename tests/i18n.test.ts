import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import { normalizeLocale, localeChain } from "@/i18n/request";
import { SUPPORTED_LOCALES } from "@/i18n/locales";

/** Alle Blatt-Keys eines Katalogs als "pfad.zum.key". */
function leafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") {
      return leafKeys(v as Record<string, unknown>, path);
    }
    return [path];
  });
}

/** Index der schliessenden Klammer zu `text[open]`, oder -1. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/**
 * Alle Argumentnamen einer ICU-Nachricht.
 *
 * Ein blosser Ausdruck wie /\{(\w+)/ reicht dafuer nicht: in
 * `{count, plural, one {noch # Sekunde} other {noch # Sekunden}}` haelt er
 * auch "noch" fuer einen Platzhalter und meldet einen Unterschied zwischen
 * zwei voellig korrekten Sprachen. Der Unterschied zwischen einem Argument
 * und dem Rumpf eines Plural-Zweigs steckt in der Verschachtelung, also wird
 * sie hier mitgelesen: `{name, plural, ...}` liefert den Namen, und die
 * Rumpfe der Zweige werden erneut als Text durchsucht — verschachtelte
 * Argumente wie `{count, plural, other {# von {total}}}` gehen so nicht
 * verloren.
 */
function placeholders(message: string): string[] {
  const names: string[] = [];
  scanText(stripQuoted(message), names);
  return names.sort();
}

/**
 * Neutralisiert ICU-Anführungszeichen.
 *
 * Ein Apostroph vor `{`, `}` oder `#` macht das Folgende bis zum naechsten
 * Apostroph zu wortwoertlichem Text. `'{q}'` ist damit kein Platzhalter,
 * sondern die sichtbare Zeichenfolge "{q}" — ein Uebersetzungsfehler, der
 * ohne diese Behandlung unentdeckt bliebe. `''` steht fuer einen einzelnen
 * Apostroph.
 */
function stripQuoted(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "'") {
      out += text[i];
      continue;
    }
    const next = text[i + 1];
    if (next === "'") {
      out += "\u0000";
      i++;
    } else if (next === "{" || next === "}" || next === "#") {
      const end = text.indexOf("'", i + 1);
      const span = end === -1 ? text.slice(i + 1) : text.slice(i + 1, end);
      out += "\u0000".repeat(span.length);
      i = end === -1 ? text.length : end;
    } else {
      out += "'";
    }
  }
  return out;
}

function scanText(text: string, out: string[]): void {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    const end = matchBrace(text, i);
    if (end === -1) return;
    const body = text.slice(i + 1, end);
    const comma = body.indexOf(",");
    const name = (comma === -1 ? body : body.slice(0, comma)).trim();
    // Nur ein einzelnes Wort ist ein Argumentname; alles andere ist der Rumpf
    // eines Zweigs und wird von scanBranches() behandelt.
    if (/^\w+$/.test(name)) {
      out.push(name);
      const rest = comma === -1 ? "" : body.slice(comma + 1);
      const type = rest.split(",")[0]!.trim();
      if (type === "plural" || type === "select" || type === "selectordinal") {
        scanBranches(rest.slice(rest.indexOf(",") + 1), out);
      }
    }
    i = end;
  }
}

/** Die `{...}` einer Plural-/Select-Liste sind Zweig-Rumpfe, keine Argumente. */
function scanBranches(text: string, out: string[]): void {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    const end = matchBrace(text, i);
    if (end === -1) return;
    scanText(text.slice(i + 1, end), out);
    i = end;
  }
}

function messageAt(obj: unknown, path: string): string | undefined {
  let cur = obj as Record<string, unknown> | undefined;
  for (const part of path.split(".")) {
    cur = cur?.[part] as Record<string, unknown> | undefined;
  }
  return cur as unknown as string | undefined;
}

const messagesDir = join(__dirname, "..", "messages");
const catalogFiles = readdirSync(messagesDir).filter((f) => f.endsWith(".json"));

function loadCatalog(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(messagesDir, file), "utf8"));
}

const enKeys = new Set(leafKeys(en));

describe("message catalogs", () => {
  it("every supported locale has a catalog file, and vice versa", () => {
    const fromFiles = catalogFiles.map((f) => f.replace(/\.json$/, "")).sort();
    expect(fromFiles).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it("de and en are complete and share exactly the same keys", () => {
    expect(leafKeys(de).sort()).toEqual([...enKeys].sort());
  });

  it("all catalogs only use keys that exist in en (fallback base)", () => {
    for (const file of catalogFiles) {
      for (const key of leafKeys(loadCatalog(file))) {
        expect(enKeys.has(key), `Unbekannter Key "${key}" in ${file}`).toBe(true);
      }
    }
  });

  it("placeholders match en for every translated key", () => {
    for (const file of catalogFiles) {
      const catalog = loadCatalog(file);
      for (const key of leafKeys(catalog)) {
        expect(
          placeholders(messageAt(catalog, key) ?? ""),
          `Platzhalter weichen ab bei "${key}" in ${file}`,
        ).toEqual(placeholders(messageAt(en, key) ?? ""));
      }
    }
  });

  it("full locales translate the entire homepage incl. marketing chrome", () => {
    // Nur die dünnen Regional-Varianten dürfen unvollständig sein.
    const overrideOnly = new Set(["en-GB.json", "es-419.json"]);
    const requiredKeys = [...enKeys].filter(
      (k) =>
        k.startsWith("errors.") ||
        k.startsWith("library.") ||
        k.startsWith("help.") ||
        k.startsWith("account.") ||
        k.startsWith("dashboard.") ||
        k.startsWith("home.") ||
        k.startsWith("marketing.") ||
        k.startsWith("authPages.") ||
        k.startsWith("pricing.") ||
        k.startsWith("features.") ||
        k.startsWith("discover.") ||
        k.startsWith("categories.") ||
        k.startsWith("community.") ||
        k.startsWith("seed.") ||
        k.startsWith("spaces."),
    );
    for (const file of catalogFiles) {
      if (overrideOnly.has(file)) continue;
      const keys = new Set(leafKeys(loadCatalog(file)));
      for (const key of requiredKeys) {
        expect(keys.has(key), `Fehlender Key "${key}" in ${file}`).toBe(true);
      }
    }
  });

  it("no empty messages anywhere", () => {
    for (const file of catalogFiles) {
      const catalog = loadCatalog(file);
      for (const key of leafKeys(catalog)) {
        expect(
          (messageAt(catalog, key) ?? "").length,
          `Leer: ${file} → ${key}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("normalizeLocale", () => {
  it("accepts supported locales and falls back to de", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("de")).toBe("de");
    expect(normalizeLocale("zh-Hant")).toBe("zh-Hant");
    expect(normalizeLocale("fr")).toBe("fr");
    expect(normalizeLocale("xx")).toBe("de");
    expect(normalizeLocale(undefined)).toBe("de");
  });
});

describe("localeChain (fallback order)", () => {
  it("plain locales fall back to en only", () => {
    expect(localeChain("fr")).toEqual(["en", "fr"]);
    expect(localeChain("de")).toEqual(["en", "de"]);
    expect(localeChain("en")).toEqual(["en"]);
  });

  it("regional variants inherit their parent language", () => {
    expect(localeChain("es-419")).toEqual(["en", "es", "es-419"]);
    // en-GB: Elternsprache ist bereits die Fallback-Basis.
    expect(localeChain("en-GB")).toEqual(["en", "en-GB"]);
    // pt-BR / zh-Hans: kein eigener Eltern-Katalog vorhanden.
    expect(localeChain("pt-BR")).toEqual(["en", "pt-BR"]);
    expect(localeChain("zh-Hans")).toEqual(["en", "zh-Hans"]);
  });
});
