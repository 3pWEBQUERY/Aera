# System Patterns — Aera

## Gesamtarchitektur

Eine einzelne Next.js-16-App (App Router) mit drei klar getrennten Produktbereichen
über Route-Gruppen:

```
app/
  (marketing)/        Landing, Pricing, Features, Login, Signup, /start, Hilfe
  (creator)/dashboard Geschützte Creator-Verwaltung: /dashboard/[slug]/...
  c/[slug]/           Mandantenfähige Community (Feed/Forum/Course/Shop/…)
  home/               Plattform-Discovery („Entdecken")
  admin/              Plattform-Admin (Users, Communities, Orders, Media, Audit, Help)
  api/                Stripe-Webhook, Health, Upload, Media, Tenant-Export, Chat, Assistant
  actions/            Server Actions (auth, community, dashboard, engage, chat, …)
lib/                  Domänen- & Infrastruktur-Logik (siehe unten)
prisma/               schema.prisma, migrations/, security/rls.sql
scripts/              apply-rls, seed (no-op), test-database
proxy.ts              Subdomain → /c/[slug] Auflösung (Next 16 Proxy)
```

## Zentrale Muster & Entscheidungen

### 1. Mandantentrennung (Multi-Tenancy) — primäres Sicherheitsprinzip
- Jede mandantenfähige Tabelle trägt `tenant_id`.
- **Jede** Query ist im Application-Layer strikt auf den aktiven Tenant gescoped
  (`lib/tenant.ts`, `lib/guards.ts`). Das ist die immer aktive Garantie.
- **Defense-in-Depth:** `npm run db:rls` aktiviert PostgreSQL Row Level Security
  (`prisma/security/rls.sql`), Policies auf Basis `current_setting('aera.tenant_id')`,
  plus least-privilege-Rolle `aera_app`.
- **KI ist tenant-isoliert:** Retrieval filtert immer nach `tenant_id` —
  kein Cross-Tenant-Kontext.

### 2. Zentrale Zugriffssteuerung über Entitlements
- Zugriff/Paywalls werden **zentral** in `lib/entitlements.ts` entschieden
  (`canAccess(space, ctx)`), **nicht** pro Feature dupliziert.
- Quellen von Entitlements: `TIER`, `PURCHASE`, `MANUAL`, `ROLE`.
- Sichtbarkeit je Space: `PUBLIC` / `MEMBERS` / `PAID`.

### 3. Spaces als polymorphes Content-Modell
- 14 `SpaceType`: FEED, FORUM, COURSE, SHOP, NEWSLETTER, EVENTS, BLOG, KNOWLEDGE,
  GALLERY, VIDEOS, CHAT, PODCAST, LINKS, ADS.
- Space-spezifische Konfiguration liegt als JSON in `space.settings`
  (`lib/space-settings.ts`), z. B. Announcements/Banner, „announcements-only".
- CHAT-Spaces und ADS-Spaces werden gesondert behandelt (Chat immer in der Nav,
  ADS/announcements-only nicht in der normalen Space-Navigation).

### 4. Server-first
- Datenzugriff in Server Components; Mutationen über **Server Actions**
  (`app/actions/*`). Client-Komponenten nur für Interaktivität
  (`"use client"`, `useActionState`).

### 5. Tenant-Auflösung
- **Pfad-basiert:** `/c/{slug}` (funktioniert sofort lokal).
- **Subdomain:** `{slug}.{ROOT_DOMAIN}` → via `proxy.ts` auf `/c/{slug}` umgeschrieben.
- **Custom Domain:** Feld `customDomain` am Tenant vorbereitet.

### 6. Layout- & Branding-Anpassung
- Tenant hält `layout` (JSON) für individuelle Navigation (`lib/layout.ts`).
- Live-Preview-Overrides für Staff beim Bearbeiten (`lib/preview.ts`).
- Branding via `primaryColor`/`accentColor` als CSS-Variablen (`--brand`).

## lib/ — Verantwortlichkeiten (Auswahl)
- `prisma.ts` (Client + pg-Adapter), `auth.ts` / `session.ts` / `tokens.ts` (Auth),
  `tenant.ts` / `guards.ts` (Tenant-Kontext & Zugriffsschutz),
  `entitlements.ts` (Zugriffslogik), `gamification.ts` (Punkte/Level/Badges),
  `ai.ts` / `assistant.ts` / `credits.ts` / `credit-plans.ts` (KI + Credits),
  `stripe.ts` (Zahlungen), `email.ts` (Newsletter/Resend), `storage.ts` (S3-Uploads),
  `validation.ts` (Zod), `audit.ts` (Audit-Log), `rate-limit.ts`, `rich-text.ts`
  (+ `sanitize-html`), `space-catalog.ts` / `space-settings.ts`, `categories.ts`.

## Konventionen
- **Sprache:** Deutsch in UI-Texten und Doku. Kundenseitig keine Fachsprache.
- **Validierung:** Zod (`zod@4`) an den Rändern (Server Actions / API).
- **Kein Lock-in:** Datenexport-Route pro Tenant (`api/tenant/[slug]/export`).
