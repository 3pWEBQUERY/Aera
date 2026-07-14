// Railway cron runner: pings every scheduled job and exits.
//
// Deploy as ONE separate Railway service with a Cron Schedule (every minute):
//   Start Command: node scripts/cron.mjs
//   Variables:     APP_URL (public app domain), CRON_SECRET (same as web service)
//
// Every endpoint only processes work that is actually due and is idempotent,
// so calling all of them once per minute is safe. Railway expects cron
// processes to exit, otherwise follow-up runs are skipped — hence the timeout
// and explicit process.exit.

const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET ?? "";

if (!base || !secret) {
  console.error("APP_URL and CRON_SECRET must be set.");
  process.exit(1);
}

// posts       → publish scheduled posts / stories windows
// newsletters → send due newsletter deliveries
// webhooks    → retry pending outgoing webhook deliveries
// automations → onboarding email drips
const JOBS = ["posts", "newsletters", "webhooks", "automations"];

let failed = 0;
for (const job of JOBS) {
  const url = `${base}/api/cron/${job}?secret=${encodeURIComponent(secret)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(110_000) });
    const body = (await res.text()).slice(0, 300);
    console.log(`[cron:${job}] ${res.status} ${body}`);
    if (!res.ok) failed++;
  } catch (e) {
    console.error(`[cron:${job}] request failed:`, e.message);
    failed++;
  }
}

process.exit(failed > 0 ? 1 : 0);
