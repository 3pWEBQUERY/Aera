# Aera

Mandantenfähige Creator-Plattform: Community, Memberships, Commerce, Kurse, Events, Newsletter, Gamification und KI-Empfehlungen — alles unter der eigenen Marke des Creators. Aufgebaut nach dem Aera.so-Plan als eine zentrale Next.js-App mit drei sauber getrennten Produktbereichen (Marketing, Creator-Dashboard, Community).

Dies ist **kein Prototyp und keine Demo** — es ist eine voll funktionsfähige Anwendung mit echter Datenbank, echter Authentifizierung, echter Mandantentrennung und echten Geschäftslogiken. Es gibt bewusst keine Demo-Inhalte; die erste echte Community wird über die Oberfläche unter `/start` angelegt.

## Tech-Stack

- **Next.js 16** (App Router, React 19, Server Components, Server Actions, TypeScript)
- **Prisma 7** (Rust-free `prisma-client` Generator + `@prisma/adapter-pg` Driver-Adapter)
- **PostgreSQL** (lokal bereits eingerichtet; Railway-kompatibel)
- **Tailwind CSS v4**
- **Auth**: E-Mail/Passwort mit `bcryptjs` + signierten Session-Cookies (`jose`/JWT)
- **Stripe** (Checkout, Subscriptions, Connect inkl. Plattformgebühr) — key-gated
- **Resend** (Newsletter) — key-gated
- **OpenAI Embeddings** (KI) — optional; ohne Key arbeitet ein transparentes Keyword-Modell

## Schnellstart

Die Datenbank läuft auf **Railway Postgres**. Das Schema (33 Tabellen) wurde
bereits in die Railway-DB migriert. Du musst nur Dependencies installieren,
RLS aktivieren und starten.

```bash
# 1) Sauber installieren (Prisma-Client wird via postinstall erzeugt)
rm -rf node_modules
npm install

# 2) Row Level Security als Defense-in-Depth aktivieren (einmalig, gegen Railway)
npm run db:rls

# 3) Entwicklungsserver starten
npm run dev
```

> **Railway-Verbindung:** Lokal nutzt `.env` die **öffentliche** Proxy-URL
> (`…proxy.rlwy.net`). Wenn die App **auf Railway** deployt wird, setze dort
> `DATABASE_URL` auf die **interne** URL (`postgres.railway.internal`) — diese
> ist nur innerhalb des Railway-Netzwerks erreichbar und schneller. Beide URLs
> stehen in der `.env` (`DATABASE_PUBLIC_URL`, `DATABASE_INTERNAL_URL`).

Öffne anschließend:

- **http://localhost:3000** — Aera-Landingpage
- **http://localhost:3000/signup** — Konto erstellen
- **http://localhost:3000/start** — eigene Community anlegen (Onboarding)
- **http://localhost:3000/dashboard** — Creator-Dashboard
- **http://localhost:3000/c/DEIN-SLUG** — die öffentliche Community

> Die `.env` ist bereits mit deiner Railway-Postgres-Verbindung vorausgefüllt.
> Für Produktion `AUTH_SECRET` unbedingt durch einen langen Zufallswert ersetzen.

### Verbindungstest

```bash
npm run db:test     # legt einen Testuser an, liest ihn, löscht ihn wieder
```

## Konfiguration (`.env`)

| Variable | Pflicht | Zweck |
|---|---|---|
| `AERA_ENVIRONMENT=production` | ✅ Live | aktiviert die strikte Runtime-Konfiguration |
| `DATABASE_URL` | ✅ | Postgres-TCP-URL (`postgres://…`) |
| `AUTH_SECRET` | ✅ | Signiert Session-Cookies (32+ Zeichen) |
| `AERA_DATA_ENCRYPTION_KEYS` | ✅ | AES-256-GCM-Keyring für TOTP- und Webhook-Secrets |
| `NEXT_PUBLIC_ROOT_DOMAIN` | ✅ | Root-Domain für Subdomain-Tenants (`aera.so`) |
| `APP_URL` | ✅ | Basis-URL für Stripe-Redirects |
| `DOMAIN_RESOLVER_ORIGIN` | ✅ | feste, vertrauenswürdige Origin für interne Domain-Auflösung (nie aus `Host`) |
| Stripe Secret/Publishable/Webhook + drei Creator-Price-IDs | ✅ Live | echte Zahlungen und Creator-Abos |
| `AERA_PLATFORM_FEE_PERCENT` | ✅ Live | Plattformgebühr (Standard 5 %) |
| `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` / `EMAIL_FROM` | ✅ Live | Transaktionsmails, Newsletter sowie signierte Bounce-/Complaint-Suppression |
| `CRON_SECRET` | ✅ | 32+ zufällige Zeichen; schützt alle Scheduler per Bearer-Header |
| `S3_ENDPOINT` / Bucket-Zugangsdaten | ✅ Live | privater Objektspeicher; große Dateien gehen direkt Browser → S3 |
| `CLAMAV_HOST` / `CLAMAV_PORT` | ✅ Live | privater Malware-Scanner; ohne ihn werden Produktionsuploads abgelehnt |
| `REDIS_URL` | ✅ Live | verteilte Rate-Limits und instanzübergreifendes Realtime-Pub/Sub |
| `BACKUP_AGE_RECIPIENT` + `BACKUP_S3_*` | ✅ Backup-Service | verschlüsselte Offsite-PostgreSQL-Backups |
| `QA_LOGIN_SECRET` | nur lokal/CI | 32+ Zeichen; QA-Login bleibt in Production immer deaktiviert |
| `OPENAI_API_KEY` | — | hebt KI von Keyword- auf Embedding-Modell |

Den Verschlüsselungs-Keyring als vollständigen Wert erzeugen und inklusive
abschließendem `=` in Railway übernehmen:

```bash
printf 'current:'; openssl rand -base64 32
```

Ein Eintrag hat das Format `key-id:base64-key`. Der Base64-Teil muss exakt
32 Zufallsbytes dekodieren; gewöhnliche Passwörter oder Railway-Zufallsstrings
sind dafür nicht geeignet. Bei einer Rotation steht der neue Schlüssel zuerst,
ältere Schlüssel bleiben durch Kommas getrennt dahinter verfügbar.

KI und Web-Push bleiben optional. Die launchkritischen Produktionspfade sind
fail-closed: echte
Zahlungen benötigen Stripe + Webhook, persistierte Secrets benötigen den
Encryption-Keyring und Uploads benötigen privaten S3-Speicher + ClamAV.

## Architektur

```
app/
  (marketing)/        Landingpage, Pricing, Features, Login, Signup, /start
  (creator)/dashboard Geschütztes Creator-Admin (Spaces, Mitglieder, Tiers,
                      Produkte, Kurse, Events, Newsletter, Gamification,
                      Branding, Datenexport)
  c/[slug]/           Mandantenfähige Community (Feed/Forum/Course/Shop/
                      Events/Newsletter/Knowledge), Join, Leaderboard, Members
  api/                Stripe-Webhook, Health, Tenant-Datenexport
  actions/            Server Actions (auth, community, dashboard, engage)
lib/                  prisma, auth, session, tenant, entitlements, gamification,
                      ai, stripe, email, guards, validation, audit
components/           UI-Bausteine, Dashboard- und Community-Komponenten
prisma/               schema.prisma, migrations/, security/rls.sql
scripts/              apply-rls, seed (no-op), test-database
proxy.ts              Subdomain → /c/[slug] Auflösung (Next 16 Proxy)
```

### Mandantentrennung & Sicherheit

- Jede mandantenfähige Tabelle trägt `tenant_id`. **Jede** Query ist im
  Application-Layer strikt auf den aktiven Tenant gescoped — das ist die
  primäre, immer aktive Garantie der Isolation.
- Prisma-Migrationen aktivieren zusätzlich **PostgreSQL Row Level Security**
  und legen die least-privilege-Rolle `aera_app` an. `npm run db:rls`
  verifiziert nur noch den installierten Zustand; es verändert keine Policies.
  Die Verbindung darf für die
  wenigen globalen Pfade (Login, Plattform-Admin, Stripe-Inbox, Discover)
  privilegiert bleiben. Sobald ein Tenant-Kontext gesetzt ist, wechselt Prisma
  in derselben Transaktion mit `SET LOCAL ROLE aera_app` in die eingeschränkte
  Rolle und setzt `aera.tenant_id`. Dadurch greift RLS auch dann tatsächlich,
  wenn `DATABASE_URL` dem DB-Owner gehört.
- Globale Audit-Einträge (`tenantId = null`) werden über die eng begrenzte
  Funktion `aera_write_audit` append-only geschrieben; Auditfehler werden
  protokolliert und nicht mehr still verschluckt.
- TOTP- und ausgehende Webhook-Secrets werden versioniert mit AES-256-GCM
  verschlüsselt. Schlüsselrotation ohne Downtime: neuen Key links im Keyring
  ergänzen, dann `npm run security:encrypt-secrets` ausführen und den alten Key
  erst entfernen, wenn keine alten Ciphertexte mehr existieren.
- Zugriff/Paywalls werden **zentral über `entitlements`** entschieden
  (`lib/entitlements.ts`) — nicht pro Feature dupliziert.
- `/admin` wird durch die persistente DB-Rolle `User.platformRole=ADMIN`
  geschützt und verlangt zusätzlich eine verifizierte E-Mail sowie aktiviertes
  TOTP. `PLATFORM_ADMIN_EMAILS` ist optional und kann den Kreis nur weiter
  einschränken, niemals Rechte erteilen. Sichere Provisionierung (inklusive
  Session-Widerruf und Audit-Log):

  ```bash
  npm run admin:grant -- --email admin@aera.so --confirm grant:admin@aera.so
  npm run admin:revoke -- --email admin@aera.so --confirm revoke:admin@aera.so
  ```

  Vor `admin:grant` muss sich das Konto regulär registriert, die E-Mail
  verifiziert und TOTP in den Kontoeinstellungen vollständig aktiviert haben.
- Tenant- und Staff-Rechte gelten nur bei `Tenant.status=ACTIVE` und einer
  `Membership.status=ACTIVE`. `SUSPENDED`/`DELETING` schließen Community,
  Creator-Dashboard und Mobile-Studio, ohne für Billing-Cleanup benötigte Daten
  vorzeitig zu löschen.
- Bezahlte Community-Checkouts werden nur bei einem vollständig aktiven
  Stripe-Connect-Konto erzeugt; es gibt keinen Plattform-only-Fallback, bei dem
  Creator-Einnahmen verloren gehen könnten. Refunds und Chargebacks entziehen
  die damit verbundenen Zugriffe, Credits, Punkte und Referral-Provisionen.
- Ausgehende Creator-Webhooks akzeptieren nur öffentliche Ziele. Private und
  Link-Local-Netze inklusive Cloud-Metadata werden nach DNS-Auflösung blockiert;
  Redirects werden nicht verfolgt.
- KI liest ausschließlich Daten des jeweiligen Tenants (`tenant_id`-Filter im
  Retrieval) — Cross-Tenant-Kontext ist ausgeschlossen.

### Tenant-Auflösung

- **Pfad-basiert**: `/c/{slug}` — funktioniert sofort lokal.
- **Subdomain**: `{slug}.{ROOT_DOMAIN}` — von `middleware.ts` auf `/c/{slug}`
  umgeschrieben.
- **Custom Domain**: Feld `customDomain` am Tenant vorbereitet.

### Sichere Direkt-Uploads

Produktionsuploads werden nicht als `formData()` im Next.js-Prozess gepuffert.
Der Browser berechnet SHA-256 streamend, reserviert das Tenant-Kontingent
atomar und lädt mit einer 15 Minuten gültigen, an Größe/Checksumme gebundenen
URL direkt in den privaten S3-Bucket. Erst nach Größen-, Checksum-, Magic-Byte-
und ClamAV-Prüfung entsteht ein sichtbares `StorageObject`. Abgebrochene
Uploads räumt der `uploads`-Cron auf.

Der S3-Bucket benötigt CORS für `PUT` mit den Headern `Content-Type`,
`x-amz-checksum-sha256` und `x-amz-meta-aera-upload-id`. Da der Bucket privat
bleibt und jeder PUT eine kurzlebige Signatur braucht, darf `AllowedOrigins`
für Creator-Custom-Domains `*` sein; `AllowedMethods` bleibt ausschließlich
`PUT`. ClamAV muss privat erreichbar sein und `StreamMaxLength` auf mindestens
`600M` setzen.

## Funktionsumfang

- **Community & Spaces** — Feed, Forum, Kurs, Shop, Newsletter, Events, Blog,
  Wissensdatenbank, Galerie, Videos. Sichtbarkeit je Space: öffentlich,
  Mitglieder, bezahlt.
- **Memberships & Paywalls** — kostenlose und bezahlte Tiers, Abos, Einmalkäufe,
  digitale Produkte; Zugriff via Entitlements.
- **Commerce** — Stripe Checkout + Connect mit Plattformgebühr (3–5 %),
  Webhook grantet Entitlements.
- **Kurse & Events** — Lektionen mit Fortschritt, RSVPs.
- **Newsletter** — Kampagnen + Segmente (Tier/Punkte), ausfallsichere
  Postgres-Empfänger-Queue mit Wiederholungen und Doppelversand-Schutz,
  ausdrückliches tenantbezogenes Opt-in, Suppression und Versand via Resend.
- **Gamification** — konfigurierbare Punkte-Regeln pro Trigger, Level, Badges,
  Leaderboard, Streaks.
- **KI-Empfehlungen** — personalisiert aus Forum-, Kurs- und Kaufkontext;
  Embeddings (mit Key) oder Keyword-Modell.
- **Datenhoheit** — vollständiger JSON-Export pro Community
  (`/dashboard/[slug]/export`).

## npm-Skripte

| Skript | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` / `start` | Production-Build / -Server |
| `npm run lint` / `typecheck` / `test` | statische und automatische Prüfungen |
| `npm run ci` | vollständiger lokaler Release-Check inklusive Build |
| `npm run env:check` | komplette Production-Konfiguration fail-fast validieren |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run db:migrate` | neue Migration erstellen & anwenden |
| `npm run db:deploy` | Migrationen anwenden (Produktion) |
| `npm run db:rls` | migrierte RLS-Policies, Rolle und Grants verifizieren |
| `npm run db:studio` | Prisma Studio |
| `npm run db:test` | Verbindungs-Smoke-Test |
| `npm run db:backup` | validierten, verschlüsselbaren PostgreSQL-Dump erzeugen/offsite laden |
| `npm run db:restore-drill -- --backup …` | Backup ausschließlich in eine bestätigte Drill-DB restoren |
| `npm run admin:grant -- --email … --confirm grant:…` | Plattform-Admin sicher provisionieren |
| `npm run admin:revoke -- --email … --confirm revoke:…` | Plattform-Admin entziehen und Sessions widerrufen |
| `npm run security:encrypt-secrets` | Plaintext/alte Ciphertexte mit dem primären Key neu verschlüsseln |
| `npm run setup` | generate + migrate deploy + RLS-Verifikation |

## Stripe-Webhook (lokal)

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# das ausgegebene Signing-Secret als STRIPE_WEBHOOK_SECRET in .env eintragen
```

Der Live-Webhook muss mindestens diese Events abonnieren:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `invoice.paid`
- `invoice.payment_failed`

- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`

## Resend-Webhook (Live)

In Resend einen signierten Webhook auf
`https://aera.so/api/resend/webhook` anlegen und mindestens
`email.bounced` sowie `email.complained` abonnieren. Das dort angezeigte
Signing-Secret kommt als `RESEND_WEBHOOK_SECRET` in den Railway Web-Service.
Ohne dieses Secret blockiert die Production-Environment-Prüfung den Start.

Newsletter und Creator-Automationen werden ausschließlich an verifizierte,
aktive Opt-ins ohne aktive Suppression eingereiht. Konto-, Verifizierungs-,
Einladungs- und Passwort-Mails bleiben technisch getrennte Transaktionsmails.

Creator-Tarife verwenden in Produktion ausschließlich die festen Price-IDs aus
`STRIPE_CREATOR_STARTER_PRICE_ID`, `STRIPE_CREATOR_PRO_PRICE_ID` und
`STRIPE_CREATOR_SCALE_PRICE_ID`. Ein Secret Key ohne Webhook-Secret aktiviert
keine bezahlten Checkouts.

## Hintergrundjobs

Alle ausführenden Cron-Endpunkte akzeptieren ausschließlich `POST` mit
`Authorization: Bearer <CRON_SECRET>`. Query-Parameter werden bewusst
abgelehnt, damit Secrets nicht in URLs, Zugriffslogs oder Browser-Verläufen
landen. Nur die read-only Betriebsansicht `/api/cron/status` verwendet `GET`
mit demselben Bearer-Header. Für Railway wird ein eigener Cron-Service aus
demselben Repository angelegt und `/railway.cron.toml` als Custom Config Path
gesetzt. Railway erlaubt als kürzestes Intervall fünf Minuten:

```text
Schedule: */5 * * * * (UTC)
Start Command: node scripts/cron.mjs
Variables: APP_URL, CRON_SECRET
```

Der Runner verarbeitet `posts`, `newsletters`, `webhooks`, `automations`,
`inventory` und `uploads` und beendet sich anschließend mit einem eindeutigen
Exit-Code für Railway. Die sechs Jobs laufen parallel unter einer globalen
50-Sekunden-Deadline. Pro Job schreibt die App einen persistenten Heartbeat in
`CronJobHeartbeat` (Status, letzter Erfolg/Fehler, Dauer und Zähler), sodass
ausgefallene oder überlappende Läufe in der Datenbank sichtbar bleiben.

Der Newsletter-Job aktiviert außerdem fällige `SCHEDULED`-Kampagnen und baut
große Empfänger-Snapshots in begrenzten, wiederaufnehmbaren Seiten auf. Der
Automations-Job verarbeitet ausschließlich Automationen; Newsletter und
Webhooks laufen nicht mehr doppelt über diese Route. `CRON_SECRET` muss
mindestens 32 zufällige Zeichen lang und im App- sowie Cron-Service identisch
sein.

Für externe Alarme liefert `GET /api/cron/status` mit demselben Bearer-Secret
die sieben Heartbeats und ausschließlich aggregierte, tenant-neutrale
Backlog-Zähler. Der Endpunkt antwortet mit `503`, wenn ein Fünf-Minuten-Job nie
lief, seit mehr als zwölf Minuten keinen Start hatte oder zuletzt fehlschlug.
Der separate tägliche Datenbank-Backupjob wird nach 26 Stunden überfällig. Die
Antwort ist immer `no-store`.

## Deployment (Railway)

Die versionierte App-Konfiguration liegt in `railway.toml`; Railway verwendet
Railpack, führt die Migration/RLS-Verifikation vor dem Release aus und schaltet
erst nach erfolgreichem `/api/health/ready` auf die neue Version. Einrichtung:

1. App-Service im selben Railway-Projekt anlegen (Repo verbinden).
2. `DATABASE_URL` als Referenz auf die **interne** DB setzen:
   `${{ Postgres.DATABASE_URL }}` (löst zu `postgres.railway.internal` auf).
3. Redis, privaten S3-Bucket und privaten ClamAV-Service hinzufügen und deren
   Referenzvariablen setzen. `AERA_ENVIRONMENT=production` plus alle mit
   `✅ Live` markierten Variablen konfigurieren; `npm run env:check` muss grün
   sein. Stripe/Resend sind im Livebetrieb nicht optional.
4. Einen Cron-Service mit Custom Config Path `/railway.cron.toml` und einen
   Backup-Service mit `/railway.backup.toml` anlegen. Backup-Ziel und
   `age`-Empfänger liegen außerhalb des primären Projekts.
5. In Railway die GitHub Check Suites als Deployment-Gate aktivieren. Damit
   wird nur nach grüner `.github/workflows/ci.yml` gebaut.
6. Nach dem ersten Release `/api/health/ready` prüfen, den Cron- und Backupjob
   einmal manuell auslösen und `/api/cron/status` auf `200` prüfen.

Die vollständigen Schritte für Alarme, Railway-Backups/PITR, Offsite-Dumps,
Restore-Drills, RPO/RTO und Incidents stehen im
[`Produktions-Runbook`](docs/operations/production-runbook.md).

## Continuous Integration

GitHub Actions verwendet die in `.nvmrc` gepinnte Node-Version und startet für
jeden Push auf `main` sowie jeden Pull Request isolierte PostgreSQL- und
Redis-Services. Die Pipeline prüft Environment-Vertrag, Migrationen, echte
RLS-/Outbox-Smokes, ESLint, TypeScript, alle Vitest-Tests, den Next.js-Build und
Produktionsabhängigkeiten mit `npm audit --audit-level=high`.

## Status der Verifikation

- ✅ ESLint und TypeScript: 0 blockierende Fehler.
- ✅ Vitest: 428/428 Tests erfolgreich.
- ✅ Playwright: 5/5 Chromium-E2E-Flows erfolgreich.
- ✅ `next build`: erfolgreich kompiliert, alle Routen & Proxy erzeugt.
- ✅ Railway PostgreSQL: 63/63 Migrationen angewendet; 71 RLS-Policies,
  Least-Privilege-Grants und Plattform-Audit-Grenze verifiziert.
- ✅ Produktionsaudit: keine Abhängigkeit mit hoher oder kritischer Severity;
  fünf transitive Hinweise mit mittlerer Severity bleiben für reguläre
  Framework-/Prisma-Upgrades vorgemerkt.
