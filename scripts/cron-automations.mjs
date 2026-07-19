// Railway-Cron-Runner: ruft die Automations-Route auf und beendet sich.
//
// Als eigener Railway-Service mit Cron Schedule (z. B. "0 * * * *") deployen:
//   Start Command: node scripts/cron-automations.mjs
//   Variablen:     APP_URL (öffentliche Domain der App), CRON_SECRET
//
// Railway erwartet, dass Cron-Prozesse sich beenden — sonst werden
// Folgeläufe übersprungen. Deshalb hartes Timeout + process.exit.

let base = (process.env.APP_URL ?? "").trim().replace(/\/$/, "");
if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;
const secret = process.env.CRON_SECRET ?? "";

if (!base || secret.length < 32) {
  console.error("APP_URL und ein CRON_SECRET mit mindestens 32 Zeichen müssen gesetzt sein.");
  process.exit(1);
}

const url = `${base}/api/cron/automations`;

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(50_000),
  });
  const body = await res.text();
  console.log(`[cron] ${res.status} ${body}`);
  process.exit(res.ok ? 0 : 1);
} catch (e) {
  console.error("[cron] Aufruf fehlgeschlagen:", e.message);
  process.exit(1);
}
