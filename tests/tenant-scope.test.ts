/**
 * Static guard for the tenant RLS scope.
 *
 * Guards and tenant resolvers only authorize; they cannot activate the RLS
 * context for their caller (an AsyncLocalStorage store entered inside an
 * awaited helper is gone after the caller's `await`). Every caller must
 * therefore run its tenant queries in an explicit
 * `withTenantContext(tenant.id, ...)` scope after the resolver returns.
 * This test fails when a new call site forgets that scope.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

/** Helpers that resolve/authorize a tenant without leaving a scope behind. */
const RESOLVERS = new Set([
  "requireTenantAdmin",
  "getCommunityContext",
  "authorizeUpload",
  "resolveTenant",
  "resolveChatAccess",
  "resolveLiveAccess",
  "requireStudioAccess",
  // file-local resolvers in app/actions
  "tenantBySlug",
  "ownMembership",
  "loadSpace",
  "resolveAward",
]);

/** Call sites that intentionally issue no tenant query after the guard. */
const ALLOWED_UNSCOPED = new Set([
  // Pure authorization before a call to Stripe's API; no database access.
  "app/actions/integration-test.ts:testStripeAction:requireTenantAdmin",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "generated" || entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = ["app", "lib", "components"].flatMap((d) => sourceFiles(path.join(ROOT, d)));

function enclosingFunctionName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) return n.name?.getText() ?? "<anon>";
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent)) {
      return n.parent.name.getText();
    }
  }
  return "<module>";
}

function isWithTenantContextCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "withTenantContext"
  );
}

function containsScope(node: ts.Node): boolean {
  if (isWithTenantContextCall(node)) return true;
  return ts.forEachChild(node, containsScope) ?? false;
}

/** The resolver result is consumed inside a withTenantContext scope. */
function isScoped(call: ts.CallExpression): boolean {
  // Already running inside a scope (e.g. a re-check within the callback).
  for (let n: ts.Node | undefined = call.parent; n; n = n.parent) {
    if (isWithTenantContextCall(n)) return true;
    if (ts.isFunctionDeclaration(n)) break;
  }
  // Otherwise a later statement of the same block must open the scope.
  let stmt: ts.Node = call;
  while (stmt.parent && !ts.isBlock(stmt.parent) && !ts.isSourceFile(stmt.parent)) stmt = stmt.parent;
  const block = stmt.parent;
  if (!block || !ts.isBlock(block)) return false;
  const index = block.statements.indexOf(stmt as ts.Statement);
  return block.statements.slice(index + 1).some(containsScope);
}

function unscopedResolverCalls(): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (![...RESOLVERS].some((name) => text.includes(`${name}(`))) continue;
    const rel = path.relative(ROOT, file);
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        RESOLVERS.has(node.expression.text) &&
        !ts.isFunctionDeclaration(node.parent)
      ) {
        const key = `${rel}:${enclosingFunctionName(node)}:${node.expression.text}`;
        if (!isScoped(node) && !ALLOWED_UNSCOPED.has(key)) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          offenders.push(`${rel}:${line} ${key}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return offenders;
}

describe("tenant RLS scope", () => {
  it("runs the code after every tenant guard/resolver inside withTenantContext", () => {
    expect(unscopedResolverCalls()).toEqual([]);
  });

  it("has no ambient setter for the tenant context", () => {
    const offenders = files
      .filter((file) => /\.enterWith\(|\bsetTenantContext\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
