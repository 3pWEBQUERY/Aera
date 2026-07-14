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

/** Alle {placeholder}-Namen einer ICU-Nachricht. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)/g)].map((m) => m[1]!).sort();
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
