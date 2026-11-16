import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  ADMIN_CLIENT_NAMESPACES,
  BASE_CLIENT_NAMESPACES,
  CREATOR_CLIENT_NAMESPACES,
  pickMessages,
} from "@/i18n/client-messages";
import de from "@/messages/de.json";

/**
 * Wächter für i18n/client-messages.ts: Jeder Namespace, den eine
 * Client-Komponente per `useTranslations` nutzt, muss im Provider ihres
 * Bereichs stecken — sonst zeigt die Seite MISSING_MESSAGE.
 *
 * Der Scan folgt den statischen und dynamischen Imports jeder Route
 * (page/layout/error/…) und wertet alle Module ab der "use client"-Grenze aus.
 */

const ROOT = path.resolve(__dirname, "..");
const EXTS = [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"];

function resolveImport(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return /\.(tsx?|jsx?)$/.test(base) ? base : null;
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
  return null;
}

interface ModuleInfo {
  isClient: boolean;
  imports: string[];
  namespaces: string[];
  dynamic: string[];
}

const cache = new Map<string, ModuleInfo>();
function scan(file: string): ModuleInfo {
  const hit = cache.get(file);
  if (hit) return hit;
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const first = sf.statements[0];
  const isClient =
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use client";
  const imports = ts
    .preProcessFile(src, true, true)
    .importedFiles.map((f) => resolveImport(f.fileName, file))
    .filter((f): f is string => !!f);
  const namespaces: string[] = [];
  const dynamic: string[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text;
      if (name === "useTranslations") {
        const a = n.arguments[0];
        if (!a) dynamic.push("useTranslations()");
        else if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) namespaces.push(a.text);
        // `dashboard.plans.features.${x}` → der feste Präfix muss abgedeckt sein.
        else if (ts.isTemplateExpression(a) && a.head.text) namespaces.push(a.head.text.replace(/\.$/, ""));
        else dynamic.push(a.getText(sf));
      } else if (name === "useMessages") {
        dynamic.push("useMessages()");
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  const info = { isClient, imports, namespaces, dynamic };
  cache.set(file, info);
  return info;
}

function clientNamespaces(entry: string) {
  const found = new Map<string, string>();
  const dynamic: string[] = [];
  const seen = new Set<string>();
  const visit = (file: string, client: boolean) => {
    const key = `${file}|${client}`;
    if (seen.has(key)) return;
    seen.add(key);
    const info = scan(file);
    const c = client || info.isClient;
    if (c) {
      for (const ns of info.namespaces) if (!found.has(ns)) found.set(ns, path.relative(ROOT, file));
      for (const d of info.dynamic) dynamic.push(`${path.relative(ROOT, file)}: ${d}`);
    }
    for (const i of info.imports) visit(i, c);
  };
  visit(entry, false);
  return { found, dynamic };
}

function routeEntries(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routeEntries(p, acc);
    else if (/^(page|layout|template|error|not-found|loading|default)\.tsx$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function providerFor(entry: string): readonly string[] {
  const rel = path.relative(path.join(ROOT, "app"), entry).split(path.sep).join("/");
  if (rel.startsWith("(creator)/dashboard/[slug]/")) return CREATOR_CLIENT_NAMESPACES;
  if (rel.startsWith("admin/")) return ADMIN_CLIENT_NAMESPACES;
  return BASE_CLIENT_NAMESPACES;
}

const covered = (ns: string, list: readonly string[]) =>
  list.some((p) => ns === p || ns.startsWith(`${p}.`));

describe("client messages", () => {
  const entries = routeEntries(path.join(ROOT, "app"));

  it("finds route entries", () => {
    expect(entries.length).toBeGreaterThan(50);
  });

  it("covers every client namespace of every route", () => {
    const missing: string[] = [];
    const dynamic = new Set<string>();
    for (const entry of entries) {
      const list = providerFor(entry);
      const { found, dynamic: dyn } = clientNamespaces(entry);
      for (const [ns, file] of found) {
        if (!covered(ns, list)) missing.push(`${path.relative(ROOT, entry)} → "${ns}" (${file})`);
      }
      dyn.forEach((d) => dynamic.add(d));
    }
    expect(missing).toEqual([]);
    // Nicht statisch auflösbare Namespaces kann der Scan nicht prüfen.
    expect([...dynamic]).toEqual([]);
  });

  it("only lists namespaces that exist in the catalog", () => {
    const all = new Set([...CREATOR_CLIENT_NAMESPACES, ...ADMIN_CLIENT_NAMESPACES]);
    const absent = [...all].filter((ns) => Object.keys(pickMessages(de, [ns])).length === 0);
    expect(absent).toEqual([]);
  });

  it("keeps server-only texts out of the browser", () => {
    const base = pickMessages(de, BASE_CLIENT_NAMESPACES);
    for (const ns of ["admin", "emails", "seed", "errors"]) expect(base).not.toHaveProperty(ns);
    expect(Object.keys((base.dashboard ?? {}) as object).sort()).toEqual(["live", "rte"]);
  });

  it("picks nested paths without touching the source", () => {
    const src = { a: { b: { c: 1, d: 2 }, e: 3 }, f: 4 };
    const snapshot = JSON.stringify(src);
    expect(pickMessages(src, ["a.b.c", "f"])).toEqual({ a: { b: { c: 1 } }, f: 4 });
    expect(pickMessages(src, ["a.b.c", "a"])).toEqual({ a: { b: { c: 1, d: 2 }, e: 3 } });
    expect(pickMessages(src, ["a", "a.b.c"])).toEqual({ a: { b: { c: 1, d: 2 }, e: 3 } });
    expect(pickMessages(src, ["x.y"])).toEqual({});
    expect(JSON.stringify(src)).toBe(snapshot);
  });
});
