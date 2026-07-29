import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Deckt jede Migration ab, was das Schema behauptet?
 *
 * Der Anlass ist ein echter Ausfall: eine bereits angewendete Migration wurde
 * nachträglich um eine Spalte ergänzt. Prisma führt eine Migration nur einmal
 * aus — die Spalte kam also nie in der Datenbank an, während der generierte
 * Client sie längst abfragte. Auffallen konnte das erst in Production, weil
 * `tsc`, `eslint` und die Tests alle nur den Code sehen.
 *
 * Die Prüfung ist absichtlich grob: sie sucht den Namen im SQL, statt SQL zu
 * verstehen. Damit erkennt sie den Fall, der wirklich passiert (etwas Neues
 * ist im Schema, aber in keiner Migration), ohne einen SQL-Parser zu pflegen.
 */

const root = new URL("..", import.meta.url).pathname;
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");

const migrationsDir = join(root, "prisma/migrations");
const migrationSql = readdirSync(migrationsDir)
  .filter((entry) => /^\d{14}_/.test(entry))
  .map((entry) => readFileSync(join(migrationsDir, entry, "migration.sql"), "utf8"))
  .join("\n");

function enumNames(): string[] {
  return [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

function models(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) out.set(m[1], m[2]);
  return out;
}

/**
 * Spaltennamen eines Modells — Beziehungsfelder gehören nicht dazu.
 *
 * `modelNames` enthält bewusst nur Modelle, keine Enums: ein Feld vom Typ
 * eines Enums ist eine ganz normale Spalte und muss mitgeprüft werden.
 */
function columnsOf(body: string, modelNames: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const [name, type] = line.split(/\s+/);
    if (!name || !type || !/^\w+$/.test(name)) continue;
    // Ein Feld, dessen Typ ein Modell ist, ist die Beziehung selbst und hat
    // keine eigene Spalte — die Fremdschlüsselspalte steht separat daneben.
    if (modelNames.has(type.replace(/[?[\]]/g, ""))) continue;
    const mapped = /@map\("([^"]+)"\)/.exec(line);
    out.push(mapped ? mapped[1] : name);
  }
  return out;
}

describe("Prisma-Migrationen decken das Schema", () => {
  it("legt jeden Enum-Typ des Schemas irgendwo an", () => {
    const missing = enumNames().filter(
      (name) => !migrationSql.includes(`CREATE TYPE "${name}"`),
    );
    expect(missing).toEqual([]);
  });

  it("erwähnt jede Spalte des Schemas in mindestens einer Migration", () => {
    const all = models();
    const modelNames = new Set(all.keys());
    const missing: string[] = [];
    for (const [model, body] of all) {
      for (const column of columnsOf(body, modelNames)) {
        if (!migrationSql.includes(`"${column}"`)) missing.push(`${model}.${column}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("vergibt jeden Migrationsnamen nur einmal", () => {
    const names = readdirSync(migrationsDir).filter((entry) => /^\d{14}_/.test(entry));
    const stamps = names.map((n) => n.slice(0, 14));
    expect(new Set(stamps).size).toBe(stamps.length);
    // Sortierreihenfolge = Ausführungsreihenfolge. Ein Name, der aus der
    // Reihe fällt, läuft später als gedacht.
    expect([...names].sort()).toEqual(names.slice().sort());
  });
});
