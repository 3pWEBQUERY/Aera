#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

try {
  process.loadEnvFile?.();
} catch {
  // Environment variables may be injected by Railway or CI.
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeDatabase(rawUrl, variable) {
  if (!rawUrl) throw new Error(`${variable} fehlt.`);
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${variable} muss eine PostgreSQL-URL sein.`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error(`${variable} enthält keinen Datenbanknamen.`);
  return { url, database };
}

function identity(value) {
  return [value.url.hostname, value.url.port || "5432", decodeURIComponent(value.url.username), value.database].join("|");
}

function databaseEnvironment(value) {
  const env = {
    ...process.env,
    PGHOST: value.url.hostname,
    PGPORT: value.url.port || "5432",
    PGUSER: decodeURIComponent(value.url.username),
    PGPASSWORD: decodeURIComponent(value.url.password),
    PGDATABASE: value.database,
  };
  const sslMode = value.url.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;
  return env;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error?.code === "ENOENT") throw new Error(`${command} ist nicht installiert oder nicht im PATH.`);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.quiet ? result.stderr?.trim() : "";
    throw new Error(`${command} ist fehlgeschlagen${detail ? `: ${detail}` : "."}`);
  }
  return result;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const backup = path.resolve(argument("--backup") ?? process.argv[2] ?? "");
if (!backup || backup === path.resolve("")) {
  throw new Error("Backup angeben: npm run db:restore-drill -- --backup /pfad/aera-….dump[.age]");
}

const target = safeDatabase(process.env.RESTORE_DATABASE_URL, "RESTORE_DATABASE_URL");
const source = process.env.DATABASE_URL ? safeDatabase(process.env.DATABASE_URL, "DATABASE_URL") : null;
if (source && identity(source) === identity(target)) {
  throw new Error("RESTORE_DATABASE_URL zeigt auf dieselbe Datenbank wie DATABASE_URL.");
}
if (!/(?:^|_)(?:restore|drill|test|ci)(?:_|$)/i.test(target.database)) {
  throw new Error("Der Zieldatenbankname muss restore, drill, test oder ci als eigenes Namensegment enthalten.");
}
if (process.env.RESTORE_DRILL_CONFIRM !== target.database) {
  throw new Error(`RESTORE_DRILL_CONFIRM muss exakt '${target.database}' entsprechen.`);
}

const checksumFile = `${backup}.sha256`;
const expectedChecksum = readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
const actualChecksum = sha256(backup);
if (!/^[a-f0-9]{64}$/i.test(expectedChecksum) || expectedChecksum !== actualChecksum) {
  throw new Error("Backup-Checksumme stimmt nicht überein.");
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), "aera-restore-drill-"));
let dump = backup;
try {
  if (backup.endsWith(".age")) {
    const identityFile = process.env.BACKUP_AGE_IDENTITY_FILE;
    if (!identityFile) throw new Error("BACKUP_AGE_IDENTITY_FILE fehlt für das verschlüsselte Backup.");
    dump = path.join(tempDir, "backup.dump");
    run("age", ["--decrypt", "--identity", identityFile, "--output", dump, backup]);
  }

  run("pg_restore", ["--list", dump], { quiet: true });
  const env = databaseEnvironment(target);
  run("pg_restore", [
    "--clean",
    "--if-exists",
    "--exit-on-error",
    "--no-owner",
    "--no-acl",
    `--dbname=${target.database}`,
    dump,
  ], { env });
  run("psql", [
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    "--tuples-only",
    "--command",
    "SELECT json_build_object('migrations', (SELECT count(*) FROM \"_prisma_migrations\"), 'tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'));",
  ], { env });

  console.log(JSON.stringify({
    ok: true,
    targetDatabase: target.database,
    checksumVerified: true,
    completedAt: new Date().toISOString(),
  }));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
