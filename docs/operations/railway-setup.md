# Railway-Einrichtung (Projekt „Aera“)

Stand der Einrichtung im Railway-Projekt **Aera**, Environment `production`,
Region `europe-west4` (Amsterdam).

Railway hat „Config as Code“ mit eigenem Pfad pro Service abgekündigt. Die
Werte aus `railway.toml` und `railway.cron.toml` sind deshalb direkt an den
Services hinterlegt. Die Dateien bleiben als Referenz im Repository: Wer dort
etwas ändert, muss es auch in den Service-Einstellungen nachziehen.

## Services

| Service | Quelle | Wichtigste Einstellungen |
|---|---|---|
| `Aera` | GitHub-Repo, Railpack | Build `npm run build`, Pre-Deploy `npm run db:predeploy`, Start `npm run start`, Healthcheck `/api/health/live` (120 s), Port 8080, Restart ON_FAILURE ×10, Overlap 30 s, Draining 20 s |
| `Cron` | GitHub-Repo, Railpack | Start `node scripts/cron.mjs`, Schedule `*/5 * * * *`, Restart NEVER |
| `ClamAV` | GitHub-Repo, Root `/infra/clamav` (Dockerfile) | privat, keine öffentliche Domain, Port 3310, `StreamMaxLength 600M` |
| `Postgres` | Railway-Template (Postgres 18) | Volume, intern `postgres.railway.internal` |
| `Redis` | Railway-Template (Redis 8) | Volume, intern `redis.railway.internal` |
| `uploads` | Railway-Bucket (ams) | privat; Zugriff nur über `/api/media` |

## Variablen des Web-Service `Aera`

Gesetzt (Referenzen lösen Railway-intern auf):

```text
AERA_ENVIRONMENT=production
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
AUTH_SECRET / AERA_DATA_ENCRYPTION_KEYS / CRON_SECRET   (zufällig erzeugt)
NEXT_PUBLIC_ROOT_DOMAIN=aera.so
APP_URL=https://aera.so
DOMAIN_RESOLVER_ORIGIN=https://<aera-…>.up.railway.app
NEXT_PUBLIC_AERA_CURRENCY=chf
AERA_PLATFORM_FEE_PERCENT=5
S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY=${{uploads.*}}
CLAMAV_HOST=${{ClamAV.RAILWAY_PRIVATE_DOMAIN}}, CLAMAV_PORT=3310
APPLE_BUNDLE_ID=so.aera.app
NEXT_PUBLIC_AELI_ROOT_DOMAIN=aeli.so, AELI_APP_URL=https://aeli.so, AELI_LAUNCHED=false
```

Noch **vom Betreiber** einzutragen (Railway → Aera → Variables). Ohne sie
bleiben die jeweiligen Funktionen aus:

| Variable | Wofür |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_CREATOR_{STARTER,PRO,SCALE}_PRICE_ID` | Zahlungen, Creator-Abos. Webhook-Ziel: `https://aera.so/api/stripe/webhook` |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` | Bestätigungs-, Passwort- und Einladungs-Mails, Newsletter |
| `GEMINI_API_KEY` (oder `OPENAI_API_KEY`) | KI-Funktionen (optional) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web-Push (optional) |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_TOKEN`, `CLOUDFLARE_STREAM_CUSTOMER_CODE` | Live über Aera (optional) |

`NEXT_PUBLIC_*`-Werte werden beim Build eingebacken: Nach einer Änderung neu
deployen.

## Cron-Service

```text
CRON_TARGET_URL=https://<aera-…>.up.railway.app
CRON_SECRET=${{Aera.CRON_SECRET}}
```

## Backup-Service (noch nicht angelegt)

Braucht ein Ziel **außerhalb** dieses Projekts (eigener S3-Bucket mit
Versionierung) und einen `age`-Empfänger, dessen privater Schlüssel nicht auf
Railway liegt. Anlegen, sobald beides existiert: Service aus dem Repo,
Builder Dockerfile, `dockerfilePath` `Dockerfile.backup`, Schedule
`17 2 * * *`, Restart NEVER, Variablen `DATABASE_URL=${{Postgres.DATABASE_URL}}`,
`AERA_ENVIRONMENT=production` und alle `BACKUP_*` (siehe Produktions-Runbook).
Bis dahin im Postgres-Service unter „Backups“ die Railway-Volume-Backups
aktivieren.

## Domains und DNS (Namecheap)

Im Web-Service hinterlegt: `aera.so`, `www.aera.so`, `*.aera.so`. Die exakten
Zielwerte stehen unter Aera → Settings → Networking. Benötigt werden:

- `@` → CNAME/ALIAS auf den angezeigten `….up.railway.app`-Wert (Namecheap:
  Typ **ALIAS** für den Apex)
- `www` → CNAME auf den angezeigten Wert
- `*` → CNAME auf den angezeigten Wert (Community-Subdomains)
- `_acme-challenge` → CNAME auf `….authorize.railwaydns.net` (Wildcard-Zertifikat)
- `_railway-verify` und `_railway-verify.www` → TXT mit den angezeigten Werten
