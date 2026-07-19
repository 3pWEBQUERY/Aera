// Railway cron runner: pings every scheduled job and exits.
//
// Deploy as ONE separate Railway service with a Cron Schedule (every 5 minutes):
//   Start Command: node scripts/cron.mjs
//   Variables:     CRON_TARGET_URL (Railway web-service domain), CRON_SECRET
//
// Every endpoint only processes work that is actually due and is idempotent.
// The calls run in parallel under one global budget so a single slow provider
// can never turn sequential slow requests into a multi-minute run.

import { normalizeCronBase, postCronRequest } from "./cron-http.mjs";

let base = "";
try {
  base = normalizeCronBase(
    process.env.CRON_TARGET_URL?.trim() || process.env.APP_URL || "",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "CRON_TARGET_URL is invalid",
  );
  process.exit(1);
}
const secret = process.env.CRON_SECRET ?? "";

if (!base || secret.length < 32) {
  console.error(
    "CRON_TARGET_URL (or APP_URL) and a CRON_SECRET of at least 32 characters must be set.",
  );
  process.exit(1);
}

// posts       → publish scheduled posts / stories windows
// newsletters → send due newsletter deliveries
// webhooks    → retry pending outgoing webhook deliveries
// automations → onboarding email drips
// inventory   → release abandoned Stripe product reservations
// uploads     → delete abandoned direct-upload objects and release quota
// lifecycle   → retry account/community/S3 deletion and orphan reconciliation
const JOBS = ["posts", "newsletters", "webhooks", "automations", "inventory", "uploads", "lifecycle"];
const GLOBAL_TIMEOUT_MS = 50_000;

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(new Error("global cron deadline exceeded")), GLOBAL_TIMEOUT_MS);

function log(level, event, fields = {}) {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: process.env.RAILWAY_SERVICE_NAME ?? "aera-cron",
    release: process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown",
    ...fields,
  });
  if (level === "error") console.error(record);
  else console.log(record);
}

async function runJob(job) {
  const url = `${base}/api/cron/${job}`;
  try {
    const { response: res, finalUrl, redirects } = await postCronRequest(url, secret, {
      signal: controller.signal,
    });
    const body = (await res.text()).slice(0, 300);
    log(res.ok ? "info" : "error", "cron_request_completed", {
      job,
      status: res.status,
      response: body,
      target: finalUrl.origin,
      redirects,
    });
    return res.ok;
  } catch (e) {
    log("error", "cron_request_failed", {
      job,
      error: e instanceof Error ? e.message.slice(0, 300) : "request failed",
    });
    return false;
  }
}

const results = await Promise.all(JOBS.map(runJob));
clearTimeout(timeout);
process.exit(results.every(Boolean) ? 0 : 1);
