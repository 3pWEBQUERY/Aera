# System Patterns — Aera

## Gesamtarchitektur

Eine einzelne Next.js-16-App (App Router) mit drei klar getrennten Produktbereichen
über Route-Gruppen:

```
app/
  (marketing)/        Landing, Pricing, Features, Login, Signup, /start, Hilfe, Recht
  (creator)/dashboard Geschützte Creator-Verwaltung: /dashboard/[slug]/...
  c/[slug]/           Mandantenfähige Community (21 Space-Typen), live/, search/
  home/               Plattform-Discovery („Entdecken") + /home/search (Live-Suche)
  admin/              Plattform-Admin (Users, Communities, Orders, Media, Audit, Help)
  api/                Stripe-/Resend-Webhooks, Health, Upload, Media, Tenant-Export,
                      Chat, Assistant, Cron (7 Jobs + status), Push, v1 (Public API)
  actions/            Server Actions (auth, community, dashboard, engage, chat, live, …)
lib/                  ~100 Domänen- & Infrastruktur-Module (Auswahl unten)
components/           UI-Bausteine, Dashboard-, Community-, Marketing-Komponenten
prisma/               schema.prisma (84 Modelle), migrations/ (79), security/rls.sql
scripts/              apply-rls, cron.mjs, backup/restore-drill, admin, smokes
proxy.ts              Subdomain → /c/[slug] Auflösung (Next 16 Proxy)
railway.toml / railway.cron.toml / railway.backup.toml   Deployment-Topologie
docs/operations/      Produktions-Runbook; docs/live-streaming-setup.md
```

## Zentrale Muster & Entscheidungen

### 1. Mandantentrennung (Multi-Tenancy) — primäres Sicherheitsprinzip
- Jede mandantenfähige Tabelle trägt `tenant_id`.
- **Jede** Query ist im Application-Layer strikt auf den aktiven Tenant gescoped
  (`lib/tenant.ts`, `lib/guards.ts`). Das ist die immer aktive Garantie.
- **Defense-in-Depth:** RLS-Policies und die least-privilege-Rolle `aera_app`
  liegen **in Migrationen**; `npm run db:rls` verifiziert nur noch. Policies auf
  Basis `current_setting('aera.tenant_id')`.
- **RLS greift auch bei DB-Owner-URL:** Globale Pfade (Login, Admin, Stripe-Inbox,
  Discover) dürfen privilegiert bleiben; sobald ein Tenant-Kontext gesetzt ist,
  wechselt Prisma in derselben Transaktion mit `SET LOCAL ROLE aera_app` +
  `aera.tenant_id` in die eingeschränkte Rolle.
- Globale Audit-Einträge (`tenantId = null`) laufen append-only über die eng
  begrenzte Funktion `aera_write_audit`; Auditfehler werden protokolliert.
- **KI ist tenant-isoliert:** Retrieval filtert immer nach `tenant_id`.
- Tenant-/Staff-Rechte nur bei `Tenant.status=ACTIVE` + `Membership.status=ACTIVE`;
  `SUSPENDED`/`DELETING` sperren Community, Dashboard und Mobile-Studio.

### 2. Zentrale Zugriffssteuerung über Entitlements
- Zugriff/Paywalls werden **zentral** in `lib/entitlements.ts` entschieden
  (`canAccess(space, ctx)`), **nicht** pro Feature dupliziert.
- Quellen: `TIER`, `PURCHASE`, `MANUAL`, `ROLE`.
- Sichtbarkeit je Space: `PUBLIC` / `MEMBERS` / `PAID`; Beiträge haben zusätzlich
  eigene Sichtbarkeit (`post_visibility`) und Per-Post-Einstellungen.

### 3. Spaces als polymorphes Content-Modell — 21 Typen
- `SpaceType`: FEED, FORUM, COURSE, SHOP, NEWSLETTER, EVENTS, BLOG, KNOWLEDGE,
  GALLERY, VIDEOS, CHAT, PODCAST, MUSIC, LINKS, ADS, LIVE, REQUESTS, BOOKING,
  STORIES, TIPS, CALENDAR.
- Space-spezifische Konfiguration als JSON in `space.settings`
  (`lib/space-settings.ts`), z. B. Announcements/Banner, „announcements-only".
- Spezialbehandlung: CHAT immer in der Nav; ADS/announcements-only nicht in der
  normalen Navigation; MUSIC nutzt dieselbe Beitragsform wie Podcast (Audio in
  `videoUrl`, Cover in `imageUrl`); LIVE hat eigene Seite `/c/[slug]/live` +
  Ingest-Quelle (`live_source`/`live_ingest`).
- **Plan-Gating:** Space-Typen sind Creator-Tarifen (STARTER/PRO/SCALE) zugeordnet;
  Onboarding zeigt den vollständigen Katalog in Plan-Reihenfolge, Promo-Codes
  schalten um (`lib/plan.ts`, `lib/plan-features.ts`, `lib/capabilities.ts`).
- Space-Symbole kommen aus einer einzigen Quelle (`components/dashboard/icons.tsx`).

### 4. Server-first
- Datenzugriff in Server Components; Mutationen über **Server Actions**
  (`app/actions/*`). Client-Komponenten nur für Interaktivität.
- Zahl-/Datumsformate über `useLocale()`/`getLocale()` durchgereicht
  (`nf`, `timeAgo`, `formatDate`, `formatPrice` mit locale-Parametern).

### 5. Tenant-Auflösung
- **Pfad-basiert:** `/c/{slug}` (funktioniert sofort lokal).
- **Subdomain:** `{slug}.{ROOT_DOMAIN}` → via `proxy.ts` auf `/c/{slug}`
  umgeschrieben; statische `public/`-Assets werden nicht umgeschrieben.
- **Custom Domain:** DNS-Verifizierung (CNAME→Root oder TXT `_aera.<domain>`),
  `customDomainVerifiedAt`; `/api/resolve-domain` löst nur verifizierte Domains
  auf; interne Auflösung über feste `DOMAIN_RESOLVER_ORIGIN` (nie aus `Host`).

### 6. Layout- & Branding-Anpassung
- Tenant hält `layout` (JSON) für individuelle Navigation (`lib/layout.ts`).
- Live-Preview-Overrides für Staff (`lib/preview.ts`); Creator sieht gespeichertes
  Layout sofort (Zielgruppen-Sync).
- Branding via `primaryColor`/`accentColor` als CSS-Variablen (`--brand`);
  Farbeingabe akzeptiert jeden Hex-Code. UI-Aktionsfarbe `#d8cfef`, `rounded-xl`
  als Standard-Radius (keine Pill-Form mehr).

### 7. Sichere Direkt-Uploads (fail-closed)
- Kein `formData()`-Puffern im Next.js-Prozess: Browser berechnet SHA-256
  streamend (`lib/client-upload.ts`), reserviert Tenant-Kontingent atomar,
  lädt mit 15-min signierter, an Größe/Checksumme gebundener URL direkt in den
  privaten S3-Bucket.
- Erst nach Größen-, Checksum-, Magic-Byte- und **ClamAV**-Prüfung
  (`lib/malware-scan.ts`) entsteht ein sichtbares `StorageObject`.
- Abgebrochene Uploads räumt der `uploads`-Cron auf. Produktion ohne
  ClamAV/S3 lehnt Uploads ab.

### 8. Secret-Verschlüsselung (Keyring)
- TOTP- und ausgehende Webhook-Secrets werden versioniert mit **AES-256-GCM**
  verschlüsselt (`AERA_DATA_ENCRYPTION_KEYS`, Format `key-id:base64-key`,
  neuester Key links).
- Rotation ohne Downtime: neuen Key ergänzen → `npm run security:encrypt-secrets`
  → alten Key erst entfernen, wenn keine alten Ciphertexte mehr existieren.

### 9. Hintergrundjobs & Monitoring
- Alle Cron-Endpunkte: nur `POST` + `Authorization: Bearer <CRON_SECRET>`;
  `/api/cron/status` (GET, read-only) liefert Heartbeats + tenant-neutrale
  Backlog-Zähler, `503` bei überfälligen/fehlgeschlagenen Jobs.
- Eigener Railway-Cron-Service (`railway.cron.toml`, alle 5 min,
  `node scripts/cron.mjs`) verarbeitet `posts`, `newsletters`, `webhooks`,
  `automations`, `inventory`, `uploads`, `lifecycle` parallel unter globaler
  50-s-Deadline; persistente `CronJobHeartbeat`s.
- Newsletter-Versand über unveränderliche Empfänger-Queue (`NewsletterDelivery`,
  Leases, Idempotency-Keys, Backoff); nur verifizierte Opt-ins ohne Suppression.
- Verschlüsselte Offsite-Backups: `db:backup` (`BACKUP_AGE_RECIPIENT`,
  `BACKUP_S3_*`) + bestätigter Restore-Drill `db:restore-drill`.

### 10. Live-Streaming
- Cloudflare Stream Live (`lib/cloudflare-stream.ts`): Live-Inputs, WHIP-URL,
  Playback; Browser-Ingest per **WebRTC/WHIP** (OBS optional), Customer-Code
  auch als Adresse akzeptiert.
- Plattform-Embeds (`lib/live-embed.ts`) mit CSP-`frame-src`-Freigabe;
  Zugriff über Tier-Auswahl statt Freitext.
- Setup-Doku: `docs/live-streaming-setup.md`.

### 11. Progressive Integrationen & Validierung
- Stripe, Resend, OpenAI, Gemini, Cloudflare, Redis, S3, VAPID: vollständig
  implementiert, schalten sich per Key frei; ohne Keys dev-freundliche Fallbacks
  (Käufe als bezahlt verbucht, Newsletter protokolliert, KI keyword-basiert).
- **Fail-closed in Produktion:** echte Zahlungen brauchen Stripe+Webhook,
  persistierte Secrets den Keyring, Uploads privaten S3+ClamAV; Env-Validierung
  progressiv (`lib/env-validation.ts`, Profile production/ci/development,
  `npm run env:check`), tötet den Boot nie grundlos.
- Stripe-Checkout für bezahlte Community-Käufe nur bei vollständig aktiviertem
  Connect-Konto; Disputes/Refunds entziehen Vorteile idempotent.
- Ausgehende Webhooks: HMAC-signiert, SSRF-geschützt (private/Link-Local-/
  Metadata-Netze nach DNS blockiert, keine Redirects).

## lib/ — Verantwortlichkeiten (Auswahl, ~100 Module)
- Kern: `prisma.ts`, `auth.ts`/`session.ts`/`tokens.ts`, `tenant.ts`/`guards.ts`,
  `entitlements.ts`, `validation.ts` (Zod), `audit.ts`, `rate-limit.ts`.
- Geld: `stripe.ts`, `creator-checkout.ts`, `credit-plans.ts`, `credits.ts`,
  `currency.ts` (plattformweit, Default CHF), `plan.ts`/`plan-features.ts`/
  `capabilities.ts`, `apple-iap.ts`/`apple-products.ts`, `referrals.ts`.
- Inhalt: `rich-text.ts` (+sanitize-html), `space-catalog.ts`/`space-settings.ts`,
  `polls.ts`, `post-access.ts`/`post-settings.ts`, `categories.ts`, `emoji.ts`,
  `color.ts`, `search.ts`/`discover-search.ts`/`dashboard-search.ts`.
- Kommunikation: `email.ts`, `newsletter-delivery.ts`, `marketing-consent.ts`,
  `notifications.ts`, `push.ts`, `chat.ts`/`realtime.ts`, `automations.ts`,
  `drip.ts`.
- KI: `ai.ts`/`assistant.ts`/`planner-ai.ts`/`moderation.ts`.
- Medien/Live: `storage.ts`, `client-upload.ts`, `malware-scan.ts`,
  `live.ts`/`live-embed.ts`/`cloudflare-stream.ts`.
- Betrieb: `env.ts`/`env-validation.ts`, `cron-auth.ts`/`cron-monitor.ts`,
  `observability.ts`, `data-export.ts`/`data-lifecycle.ts`, `legal.ts`/
  `legal-evidence.ts`, `platform-admin.ts`, `badges.ts`/`member-badges.ts`,
  `gamification.ts`, `analytics.ts`, `api-keys.ts`/`public-api.ts`/`webhooks.ts`,
  `domains.ts`, `totp.ts`, `verification.ts`, `action-errors.ts`, `layout.ts`,
  `preview.ts`, `dashboard-nav-items.ts`, `mobile/`, `data/`.

## Konventionen
- **Sprache:** Deutsch in UI-Texten und Doku; kundenseitig keine Fachsprache.
  Neue UI-Texte immer in allen 17 Vollkatalogen (DE+EN zuerst); i18n über
  `next-intl` (Cookie `NEXT_LOCALE`, 19 Locales, Fallback-Kette).
- **Validierung:** Zod (`zod@4`) an den Rändern (Server Actions / API);
  Fehler als `errors.*`-Keys via `lib/action-errors.ts` (`tErr`/`zodErr`).
- **Kein Lock-in:** Datenexport pro Tenant (`api/tenant/[slug]/export`) +
  Streaming-Exporte + Lifecycle-Löschung.
- **Tests:** Vitest (508) + Playwright (5 kritische Flows); CI-Gate mit
  `npm audit --audit-level=high` vor Railway-Deploy.
