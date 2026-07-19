#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  createReadStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

try {
  process.loadEnvFile?.();
} catch {
  // Railway and CI inject variables directly; a local .env is optional.
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function databaseEnvironment(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL muss eine PostgreSQL-URL sein.");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL enthält keinen Datenbanknamen.");

  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
  };
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;
  return env;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(`${command} ist nicht installiert oder nicht im PATH.`);
  }
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

function removeIfPresent(file) {
  try {
    unlinkSync(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function recordBackupHeartbeat(status, startedAt, details = {}) {
  const durationMs = Math.max(0, Date.now() - startedAt.getTime());
  const env = databaseEnvironment(databaseUrl);
  let sql;
  if (status === "RUNNING") {
    sql = `
      INSERT INTO "CronJobHeartbeat" (
        "job", "status", "lastStartedAt", "lastCounters", "totalRuns", "updatedAt"
      ) VALUES ('database-backup', 'RUNNING', CURRENT_TIMESTAMP, '{}', 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("job") DO UPDATE SET
        "status" = 'RUNNING',
        "lastStartedAt" = CURRENT_TIMESTAMP,
        "lastError" = NULL,
        "totalRuns" = "CronJobHeartbeat"."totalRuns" + 1,
        "updatedAt" = CURRENT_TIMESTAMP;
    `;
  } else if (status === "SUCCEEDED") {
    const bytes = Number.isSafeInteger(details.bytes) ? details.bytes : 0;
    const offsite = details.offsite ? "true" : "false";
    sql = `
      UPDATE "CronJobHeartbeat" SET
        "status" = 'SUCCEEDED',
        "lastSucceededAt" = CURRENT_TIMESTAMP,
        "lastDurationMs" = ${durationMs},
        "lastCounters" = jsonb_build_object('bytes', ${bytes}, 'offsite', ${offsite}),
        "lastError" = NULL,
        "totalSucceeded" = "totalSucceeded" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "job" = 'database-backup';
    `;
  } else {
    sql = `
      INSERT INTO "CronJobHeartbeat" (
        "job", "status", "lastStartedAt", "lastFailedAt", "lastDurationMs",
        "lastCounters", "lastError", "totalRuns", "totalFailed", "updatedAt"
      ) VALUES (
        'database-backup', 'FAILED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${durationMs},
        '{}', 'backup-failed', 1, 1, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("job") DO UPDATE SET
        "status" = 'FAILED',
        "lastFailedAt" = CURRENT_TIMESTAMP,
        "lastDurationMs" = ${durationMs},
        "lastCounters" = '{}',
        "lastError" = 'backup-failed',
        "totalFailed" = "CronJobHeartbeat"."totalFailed" + 1,
        "updatedAt" = CURRENT_TIMESTAMP;
    `;
  }
  run("psql", ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--command", sql], {
    env,
    quiet: true,
  });
}

async function uploadOffsite(files, baseName) {
  const config = {
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    region: process.env.BACKUP_S3_REGION || "auto",
    bucket: process.env.BACKUP_S3_BUCKET,
    accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
  };
  const required = [config.endpoint, config.bucket, config.accessKeyId, config.secretAccessKey];
  if (required.some(Boolean) && required.some((value) => !value)) {
    throw new Error("BACKUP_S3_* ist nur teilweise konfiguriert.");
  }
  if (!required.some(Boolean)) return null;

  const [{ S3Client, PutObjectCommand }] = await Promise.all([
    import("@aws-sdk/client-s3"),
  ]);
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const prefix = (process.env.BACKUP_S3_PREFIX || "postgres").replace(/^\/+|\/+$/g, "");
  const month = baseName.slice(5, 11);
  const remote = [];
  for (const file of files) {
    const key = `${prefix}/${month}/${path.basename(file)}`;
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: createReadStream(file),
      ContentLength: statSync(file).size,
      ContentType: file.endsWith(".json") ? "application/json" : "application/octet-stream",
    }));
    remote.push(key);
  }
  client.destroy();
  return { bucket: config.bucket, keys: remote };
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL fehlt.");

const outputDir = path.resolve(argument("--output-dir") ?? process.env.BACKUP_OUTPUT_DIR ?? "backups");
const retentionDaysRaw = argument("--retention-days") ?? process.env.BACKUP_RETENTION_DAYS;
const retentionDays = retentionDaysRaw ? Number(retentionDaysRaw) : undefined;
if (retentionDays !== undefined && (!Number.isInteger(retentionDays) || retentionDays < 1)) {
  throw new Error("--retention-days muss eine positive ganze Zahl sein.");
}

const ageRecipient = argument("--age-recipient") ?? process.env.BACKUP_AGE_RECIPIENT;
const isProduction = process.env.AERA_ENVIRONMENT === "production" || process.env.NODE_ENV === "production";
if (isProduction && !ageRecipient && !hasFlag("--allow-plaintext")) {
  throw new Error(
    "Produktionsbackups müssen verschlüsselt werden. BACKUP_AGE_RECIPIENT setzen; " +
      "--allow-plaintext ist nur für einen bewusst abgesicherten Zielspeicher vorgesehen.",
  );
}

mkdirSync(outputDir, { recursive: true, mode: 0o700 });
chmodSync(outputDir, 0o700);

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const baseName = `aera-${timestamp}`;
const partialDump = path.join(outputDir, `.${baseName}.partial.dump`);
const partialEncrypted = path.join(outputDir, `.${baseName}.partial.dump.age`);
const finalPath = path.join(outputDir, `${baseName}.dump${ageRecipient ? ".age" : ""}`);
const startedAt = new Date();

try {
  recordBackupHeartbeat("RUNNING", startedAt);
  run("pg_dump", [
    "--format=custom",
    "--compress=9",
    "--no-owner",
    "--no-acl",
    "--file",
    partialDump,
  ], { env: databaseEnvironment(databaseUrl) });

  // A dump that cannot even be listed is not a usable backup.
  run("pg_restore", ["--list", partialDump], { quiet: true });
  chmodSync(partialDump, 0o600);

  if (ageRecipient) {
    run("age", ["--encrypt", "--recipient", ageRecipient, "--output", partialEncrypted, partialDump]);
    chmodSync(partialEncrypted, 0o600);
    removeIfPresent(partialDump);
    renameSync(partialEncrypted, finalPath);
  } else {
    renameSync(partialDump, finalPath);
  }

  const checksum = sha256(finalPath);
  const checksumPath = `${finalPath}.sha256`;
  writeFileSync(checksumPath, `${checksum}  ${path.basename(finalPath)}\n`, { mode: 0o600 });
  const manifestPath = `${finalPath}.json`;
  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      format: "pg_dump-custom",
      encrypted: Boolean(ageRecipient),
      artifact: path.basename(finalPath),
      sha256: checksum,
      bytes: statSync(finalPath).size,
      createdAt: new Date().toISOString(),
      railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
      release: process.env.RAILWAY_DEPLOYMENT_ID ?? process.env.GIT_COMMIT_SHA ?? null,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );

  const offsite = await uploadOffsite([finalPath, checksumPath, manifestPath], baseName);
  if (isProduction && !offsite && process.env.BACKUP_ALLOW_LOCAL_ONLY !== "true") {
    throw new Error(
      "Produktionsbackups benötigen BACKUP_S3_* als unabhängiges Ziel oder die explizite " +
        "Ausnahme BACKUP_ALLOW_LOCAL_ONLY=true für ein bereits extern repliziertes Volume.",
    );
  }

  if (retentionDays !== undefined) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1_000;
    for (const entry of readdirSync(outputDir)) {
      if (!/^aera-\d{8}T\d{6}Z\.dump(?:\.age)?(?:\.sha256|\.json)?$/.test(entry)) continue;
      const candidate = path.join(outputDir, entry);
      if (statSync(candidate).mtimeMs < cutoff) unlinkSync(candidate);
    }
  }

  recordBackupHeartbeat("SUCCEEDED", startedAt, {
    bytes: statSync(finalPath).size,
    offsite: Boolean(offsite),
  });

  console.log(JSON.stringify({
    ok: true,
    artifact: finalPath,
    checksum: `${finalPath}.sha256`,
    encrypted: Boolean(ageRecipient),
    offsite,
  }));
} catch (error) {
  removeIfPresent(partialDump);
  removeIfPresent(partialEncrypted);
  try {
    recordBackupHeartbeat("FAILED", startedAt);
  } catch {
    // The backup process still exits non-zero; Railway/log monitoring remains
    // the fallback when PostgreSQL itself is unavailable.
  }
  throw error;
}
