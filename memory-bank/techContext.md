# Tech Context — Aera

## Tech-Stack

- **Next.js 16.2.11** (App Router, React 19.2, Server Components, Server Actions,
  TypeScript 5.9)
- **Prisma 7** — Rust-free `prisma-client` Generator + `@prisma/adapter-pg`
  (Driver-Adapter). Generierter Client liegt unter `app/generated/prisma`.
- **PostgreSQL** — läuft auf **Railway Postgres** (79 Migrationen deployed).
- **Tailwind CSS v4** (`@tailwindcss/postcss`).
- **next-intl** — 19 Locales (17 Vollkataloge + en-GB/es-419 Overrides), Cookie
  `NEXT_LOCALE`, Fallback-Kette.
- **Auth:** E-Mail/Passwort mit `bcryptjs` + signierten Session-Cookies (`jose`/JWT),
  TOTP-2FA (`qrcode`-Package, RFC 6238 eigenständig).
- **Stripe** (`stripe@19`) — Checkout, Subscriptions, Connect, Creator-Tarife mit
  festen Price-IDs; fail-closed in Produktion.
- **Resend** (Newsletter + Transaktionsmails) — signierter Webhook für
  Bounce-/Complaint-Suppression.
- **Gemini** — KI-Assistent (Chat) + Bildgenerierung (`gemini-3.1-flash-image`),
  Moderations-Klassifikation; **OpenAI Embeddings** optional (sonst Keyword-Modell).
- **Cloudflare Stream Live** — Browser-WebRTC/WHIP-Ingest + Playback.
- **AWS S3** (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` +
  `@aws-crypto/sha256-browser`) — private Buckets, signierte Direkt-Uploads.
- **ClamAV** (privater Service) — Malware-Scan für Uploads (Pflicht in Produktion).
- **Redis** (`ioredis`) — verteilte Rate-Limits + Realtime-Pub/Sub (optional lokal).
- **web-push** (VAPID) — optionale Push-Benachrichtigungen.
- **sanitize-html** — Bereinigung von Rich-Text.
- **Node >=24 <25**, npm >=11 <12 (`.nvmrc` gepinnt, CI nutzt dieselbe Version).

## Wichtige npm-Skripte

| Skript | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver (localhost:3000) |
| `npm run build` / `start` | Production-Build / -Server (`prestart` validiert Env) |
| `npm run check` | lint + typecheck + test |
| `npm run ci` | check + build (vollständiger lokaler Release-Check) |
| `npm run env:check[:ci/:development]` | Env-Konfiguration profilbasiert validieren |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `test:watch` | Vitest (aktuell 508 Tests, 68 Dateien) |
| `npm run test:e2e` | Playwright (5 kritische Chromium-Flows) |
| `npm run db:migrate` / `db:deploy` | Migration erstellen / anwenden |
| `npm run db:rls` | migrierte RLS-Policies, Rolle und Grants **verifizieren** |
| `npm run db:test` | Verbindungs-Smoke-Test |
| `npm run db:smoke:ci` | Seed + RLS-/Credits-/Webhook-/Automations-/Newsletter-Smokes |
| `npm run db:backup` / `db:restore-drill` | verschlüsselter Offsite-Dump / bestätigter Drill-Restore |
| `npm run admin:grant/revoke/status` | Plattform-Admin provisionieren/entziehen/prüfen |
| `npm run security:encrypt-secrets` | Secret-Rotation mit primärem Keyring-Key |
| `npm run db:snap-prices` | Preise auf Apple-IAP-Preispunkte snappen |
| `npm run setup` | generate + migrate deploy + RLS-Verifikation |

`postinstall` erzeugt automatisch den Prisma-Client (`prisma generate`).

## Konfiguration (`.env`) — Auswahl

| Variable | Pflicht | Zweck |
|---|---|---|
| `AERA_ENVIRONMENT=production` | ✅ Live | strikte Runtime-Konfiguration |
| `DATABASE_URL` | ✅ | Postgres-TCP-URL |
| `AUTH_SECRET` | ✅ | Session-Cookies (32+ Zeichen) |
| `AERA_DATA_ENCRYPTION_KEYS` | ✅ | AES-256-GCM-Keyring (TOTP-/Webhook-Secrets) |
| `NEXT_PUBLIC_ROOT_DOMAIN` / `APP_URL` | ✅ | Subdomain-Tenants / Basis-URL |
| `DOMAIN_RESOLVER_ORIGIN` | ✅ | feste Origin für interne Domain-Auflösung |
| `STRIPE_SECRET_KEY`/`_WEBHOOK_SECRET` + 3 Creator-Price-IDs | ✅ Live | Zahlungen + Creator-Tarife |
| `AERA_PLATFORM_FEE_PERCENT` | ✅ Live | Plattformgebühr (Standard 5 %) |
| `RESEND_API_KEY`/`RESEND_WEBHOOK_SECRET`/`EMAIL_FROM` | ✅ Live | Mails + Suppression |
| `CRON_SECRET` | ✅ | Bearer-Schutz aller Scheduler (32+ Zeichen) |
| `S3_ENDPOINT` + Bucket-Zugangsdaten | ✅ Live | privater Objektspeicher, Direkt-Uploads |
| `CLAMAV_HOST`/`CLAMAV_PORT` | ✅ Live | Malware-Scan; ohne ihn keine Prod-Uploads |
| `REDIS_URL` | ✅ Live | verteilte Rate-Limits, Realtime-Pub/Sub |
| `BACKUP_AGE_RECIPIENT` + `BACKUP_S3_*` | ✅ Backup-Service | verschlüsselte Offsite-Backups |
| `CLOUDFLARE_STREAM_*` | — | Live-Streaming (WHIP-Ingest, Playback) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` | — | Web-Push |
| `OPENAI_API_KEY` | — | Embedding- statt Keyword-KI |
| `GEMINI_IMAGE_MODEL` | — | Bild-Modell (Default `gemini-3.1-flash-image`) |
| `QA_LOGIN_SECRET` | nur lokal/CI | QA-Login (in Production immer deaktiviert) |

Keyring erzeugen: `printf 'current:'; openssl rand -base64 32` — der Base64-Teil
muss exakt 32 Zufallsbytes dekodieren.

## Datenbank

- **84 Modelle** in `prisma/schema.prisma`; **79 Migrationen**.
- U. a. User, Tenant, Membership, Space, Post (mit Cover/Settings/Visibility/
  mehreren Bildern), Comment (Antworten + Reaktionen), Poll, MembershipTier,
  Product, Order, Subscription, Entitlement, Course/Lesson (Drip)/LessonProgress,
  Event/EventRsvp, NewsletterCampaign/Segment/NewsletterDelivery/EmailEvent,
  GamificationRule/Level/Badge/BadgeAward/PointsLedger, LiveSession (Source/Ingest),
  Conversation/ChatMessage, StorageObject/MediaFolder, AssistantConversation
  (kind CHAT/IMAGE)/AssistantMessage, AiCreditWallet/Purchase/UsageEvent,
  SupportTicket, SeoSettings, CronJobHeartbeat, AutomationStep/Delivery,
  ApiKey/WebhookEndpoint/Delivery, ModerationFlag, Notification, PushSubscription,
  HelpCategory/Article, KnowledgeArticle, AuditLog, LegalAcceptance.
- RLS-Policies + `aera_app`-Rolle liegen in Migrationen; `db:rls` verifiziert.

## Railway-Topologie

- **Web-Service** (`railway.toml`, Railpack): Pre-Deploy `db:predeploy`
  (migrate deploy + RLS-Verifikation), Healthcheck `/api/health/live` für den
  Release-Switch; `/api/health/ready` für externes Monitoring.
- **Cron-Service** (`railway.cron.toml`, `*/5 * * * *`): `node scripts/cron.mjs`
  mit `CRON_TARGET_URL` (generierte `*.up.railway.app`-Domain des Web-Service)
  + `CRON_SECRET` — keine Wildcard-/Custom-Domain.
- **Backup-Service** (`railway.backup.toml`): Backup-Ziel + age-Empfänger
  außerhalb des primären Projekts.
- **Lokal:** `.env` nutzt die **öffentliche** Proxy-URL (`…proxy.rlwy.net`);
  auf Railway die **interne** (`postgres.railway.internal`) via
  `${{ Postgres.DATABASE_URL }}`.
- GitHub Check Suites als Deployment-Gate: Railway baut nur nach grüner
  `.github/workflows/ci.yml` (PostgreSQL-/Redis-Services, Env-Vertrag,
  Migrationen, RLS-/Outbox-Smokes, Lint, tsc, Vitest, Build, npm-audit-high).

## Stripe-Webhook (lokal)
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# ausgegebenes Signing-Secret als STRIPE_WEBHOOK_SECRET in .env
```
Live mindestens: checkout.session.* (completed/async_*/expired), invoice.paid/
payment_failed, customer.subscription.updated/deleted, charge.refunded,
charge.dispute.created/closed. Resend-Webhook: `email.bounced`, `email.complained`.

## Technische Constraints
- Postgres-Superuser & Table-Owner umgehen RLS → Tenant-Pfade wechseln pro
  Transaktion via `SET LOCAL ROLE aera_app` + `aera.tenant_id`.
- Keine Demo-Daten (`seed.ts` bewusst no-op; `seed-ci.ts` nur für CI-Smokes).
- Cron-Endpunkte akzeptieren nur `POST` + Bearer (keine Query-Secrets).
- Dependency-Overrides (`sharp`, `postcss`, `find-my-way`) halten npm-audit
  high/critical bei 0; fünf mittlere transitive Hinweise für Framework-Upgrades
  vorgemerkt.
- Vollständige Betriebsdetails (Alarme, PITR, RPO/RTO, Incidents):
  `docs/operations/production-runbook.md`.
