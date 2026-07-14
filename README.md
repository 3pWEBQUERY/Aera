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
| `DATABASE_URL` | ✅ | Postgres-TCP-URL (`postgres://…`) |
| `AUTH_SECRET` | ✅ | Signiert Session-Cookies (32+ Zeichen) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | ✅ | Root-Domain für Subdomain-Tenants (`aera.so`) |
| `APP_URL` | ✅ | Basis-URL für Stripe-Redirects |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | — | aktiviert echte Zahlungen |
| `AERA_PLATFORM_FEE_PERCENT` | — | Plattformgebühr (Standard 5 %) |
| `RESEND_API_KEY` | — | aktiviert echten Newsletter-Versand |
| `CRON_SECRET` | — | schützt Newsletter-/Webhook-/Automations-Scheduler |
| `OPENAI_API_KEY` | — | hebt KI von Keyword- auf Embedding-Modell |

Alle Integrationen sind **vollständig implementiert** und schalten sich frei,
sobald der jeweilige Key gesetzt ist. Ohne Keys bleibt die App vollständig
nutzbar: kostenlose Tiers, Käufe (im Dev als bezahlt verbucht), Newsletter
(protokolliert) und KI (Keyword-basiert) funktionieren.

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
- Zusätzlich aktiviert `npm run db:rls` **PostgreSQL Row Level Security** und
  legt die least-privilege-Rolle `aera_app` an. Die Verbindung darf für die
  wenigen globalen Pfade (Login, Plattform-Admin, Stripe-Inbox, Discover)
  privilegiert bleiben. Sobald ein Tenant-Kontext gesetzt ist, wechselt Prisma
  in derselben Transaktion mit `SET LOCAL ROLE aera_app` in die eingeschränkte
  Rolle und setzt `aera.tenant_id`. Dadurch greift RLS auch dann tatsächlich,
  wenn `DATABASE_URL` dem DB-Owner gehört.
- Globale Audit-Einträge (`tenantId = null`) werden über die eng begrenzte
  Funktion `aera_write_audit` append-only geschrieben; Auditfehler werden
  protokolliert und nicht mehr still verschluckt.
- Zugriff/Paywalls werden **zentral über `entitlements`** entschieden
  (`lib/entitlements.ts`) — nicht pro Feature dupliziert.
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
  Versand via Resend, Zustell-Events.
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
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run db:migrate` | neue Migration erstellen & anwenden |
| `npm run db:deploy` | Migrationen anwenden (Produktion) |
| `npm run db:rls` | RLS-Policies + `aera_app`-Rolle anlegen |
| `npm run db:studio` | Prisma Studio |
| `npm run db:test` | Verbindungs-Smoke-Test |
| `npm run setup` | generate + migrate deploy + RLS |

## Stripe-Webhook (lokal)

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# das ausgegebene Signing-Secret als STRIPE_WEBHOOK_SECRET in .env eintragen
```

## Deployment (Railway)

Das Postgres-Plugin ist bereits eingerichtet und migriert. Für den App-Service:

1. App-Service im selben Railway-Projekt anlegen (Repo verbinden).
2. `DATABASE_URL` als Referenz auf die **interne** DB setzen:
   `${{ Postgres.DATABASE_URL }}` (löst zu `postgres.railway.internal` auf).
3. Übrige Env-Variablen setzen: `AUTH_SECRET` (langer Zufallswert!), `APP_URL`
   (deine Railway-Domain), `NEXT_PUBLIC_ROOT_DOMAIN`, optional Stripe/Resend/OpenAI.
4. Build-Command `npm run build`, Start-Command `npm run start`.
5. Migrationen/RLS werden einmalig ausgeführt: `npm run db:deploy && npm run db:rls`
   (lokal gegen die Public-URL oder als Railway-Deploy-Command).
6. `npm run db:test-rls` bestätigt, dass Tenant-Abfragen unter `aera_app`
   isoliert laufen und globale Audit-Einträge weiterhin funktionieren.

## Status der Verifikation

- ✅ TypeScript: 0 Fehler über alle Dateien (gegen den echten Prisma-Client).
- ✅ `next build`: erfolgreich kompiliert, alle Routen & Middleware erzeugt.
- ✅ Datenbank-Migration angewendet (33 Tabellen) auf **Railway Postgres**.
