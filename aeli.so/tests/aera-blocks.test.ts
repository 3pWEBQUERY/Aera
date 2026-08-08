import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AERA_FETCH_LIMIT,
  BLOCK_CATALOG,
  aeraContentKind,
  parseBlockConfig,
} from "@/lib/blocks";

/**
 * Die fünf Bausteine, die ihren Inhalt aus Aera holen.
 *
 * Was hier geprüft wird, sind genau die Fehler, die man beim Hinzufügen eines
 * sechsten machen wird: den Eintrag im Katalog vergessen, die Zuordnung zur
 * Liste vergessen, oder — der teuerste — eine Spalte ins Spiegelschema
 * schreiben, die die Migration nie gewährt hat. Der letzte Fehler fällt sonst
 * erst in Produktion auf, als „permission denied for table Event" mitten im
 * Seitenaufbau.
 */

const AERA_TYPES = ["AERA_EVENTS", "AERA_TIERS", "AERA_SHOP", "AERA_COURSES", "AERA_SPACES"] as const;

describe("Aera-Bausteine im Katalog", () => {
  it("kennt jeden Typ genau einmal", () => {
    for (const type of AERA_TYPES) {
      const entries = BLOCK_CATALOG.filter((entry) => entry.type === type);
      expect(entries, type).toHaveLength(1);
    }
  });

  it("verlangt für alle eine verknüpfte Community", () => {
    for (const type of AERA_TYPES) {
      const entry = BLOCK_CATALOG.find((candidate) => candidate.type === type)!;
      // Ohne Community gibt es nichts zu zeigen. Wäre der Baustein trotzdem
      // anlegbar, stünde er als leere Zeile in der Liste und der Creator
      // suchte den Fehler bei sich.
      expect(entry.needsCommunity, type).toBe(true);
      expect(entry.group, type).toBe("community");
      // Ein Ziel braucht keiner: verlinkt wird immer in die Community.
      expect(entry.needsHref, type).toBe(false);
      expect(entry.defaults.title, type).toBeTruthy();
    }
  });

  it("ordnet jedem Typ eine Liste zu — und sonst keinem", () => {
    const kinds = AERA_TYPES.map((type) => aeraContentKind(type));
    expect(kinds).toEqual(["events", "tiers", "products", "courses", "spaces"]);

    for (const entry of BLOCK_CATALOG) {
      const isAera = (AERA_TYPES as readonly string[]).includes(entry.type);
      expect(aeraContentKind(entry.type) !== null, entry.type).toBe(isAera);
    }
  });
});

describe("limit", () => {
  it("bleibt innerhalb dessen, was überhaupt geladen wird", () => {
    expect(parseBlockConfig({ limit: AERA_FETCH_LIMIT }).limit).toBe(AERA_FETCH_LIMIT);
    // Eine höhere Zahl wäre eine Zusage, die die Abfrage nicht einlöst.
    expect(parseBlockConfig({ limit: AERA_FETCH_LIMIT + 1 }).limit).toBeUndefined();
    expect(parseBlockConfig({ limit: 0 }).limit).toBeUndefined();
    expect(parseBlockConfig({ limit: 2.5 }).limit).toBeUndefined();
  });
});

/**
 * Spiegelschema gegen Migration.
 *
 * Das Spiegelschema in aeli.so/prisma/schema.prisma darf für die fünf
 * Aera-Tabellen nur Spalten führen, die die Migration der Rolle `aeli_app`
 * auch gewährt hat. Prisma zieht bei einer Abfrage ohne `select` alle
 * deklarierten Felder — ein zu viel deklariertes Feld ist damit eine
 * scharfgestellte Abfrage, die beim ersten Aufruf scheitert.
 */
describe("Spiegelschema und Grants", () => {
  const TABLES = ["Space", "Event", "MembershipTier", "Product", "Course"] as const;

  const migration = readFileSync(
    new URL("../../prisma/migrations/20260808120000_aeli_aera_blocks/migration.sql", import.meta.url),
    "utf8",
  );
  const mirror = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

  /** Die Spaltenliste eines `GRANT SELECT (...) ON "X"`. */
  function granted(table: string): Set<string> {
    const match = migration.match(
      new RegExp(`GRANT SELECT \\(([^)]*)\\) ON "${table}" TO aeli_app`, "s"),
    );
    expect(match, `kein GRANT für ${table}`).toBeTruthy();
    return new Set([...match![1]!.matchAll(/"([^"]+)"/g)].map((hit) => hit[1]!));
  }

  /**
   * Die Spaltenfelder eines Modells im Spiegelschema.
   *
   * Ausgenommen sind Relationsfelder: `tenant Tenant @relation(...)` steht für
   * keine Spalte, der Fremdschlüssel daneben (`tenantId String`) schon. Beide
   * unterscheiden sich zuverlässig am `@relation`.
   */
  const MODELS = new Set([...TABLES, "Tenant"]);

  function declared(model: string): string[] {
    const match = mirror.match(new RegExp(`\\nmodel ${model} \\{(.*?)\\n\\}`, "s"));
    expect(match, `kein Modell ${model} im Spiegel`).toBeTruthy();

    return match![1]!
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter((line) => line && !line.startsWith("@@"))
      .map((line) => line.split(/\s+/) as [string, string, ...string[]])
      .filter(([, type]) => !MODELS.has(type.replace(/[?[\]]/g, "")))
      .map(([name]) => name);
  }

  for (const table of TABLES) {
    it(`${table}: jedes gespiegelte Feld ist auch gewährt`, () => {
      const allowed = granted(table);
      for (const field of declared(table)) {
        expect(allowed.has(field), `${table}.${field} steht im Spiegel, aber in keinem GRANT`).toBe(
          true,
        );
      }
    });
  }

  it("nennt für jede Tabelle eine Policy", () => {
    for (const policy of [
      "aeli_public_space",
      "aeli_public_event",
      "aeli_public_tier",
      "aeli_public_product",
      "aeli_public_course",
    ]) {
      expect(migration, policy).toContain(`CREATE POLICY ${policy} ON`);
    }
    // Ein `TO aeli_app` weniger und die Policy gälte für jede Rolle — auch für
    // `aera_app`, dessen Tenant-Isolation damit ein Loch bekäme.
    const policies = [...migration.matchAll(/CREATE POLICY (\w+) ON "(\w+)"([\s\S]*?);\n/g)];
    for (const [, name, , body] of policies) {
      expect(body, `${name} ist nicht auf aeli_app begrenzt`).toContain("TO aeli_app");
    }
  });
});
