// Railway-Cron-Runner: ruft die Automations-Route auf und beendet sich.
//
// Als eigener Railway-Service mit Cron Schedule (z. B. "0 * * * *") deployen:
//   Start Command: node scripts/cron-automations.mjs
//   Variablen:     APP_URL (öffentliche Domain der App), CRON_SECRET
//
// Railway erwartet, dass Cron-Prozesse sich beenden — sonst werden
// Folgeläufe übersprungen. Deshalb hartes Timeout + process.exit.

const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET ?? "";

if (!base || !secret) {
  console.error("APP_URL und CRON_SECRET müssen gesetzt sein.");
  process.exit(1);
}

const url = `${base}/api/cron/automations?secret=${encodeURIComponent(secret)}`;

try {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  const body = await res.text();
  console.log(`[cron] ${res.status} ${body}`);
  process.exit(res.ok ? 0 : 1);
} catch (e) {
  console.error("[cron] Aufruf fehlgeschlagen:", e.message);
  process.exit(1);
}
