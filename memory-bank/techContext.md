# Tech Context — Aera

## Tech-Stack

- **Next.js 16** (App Router, React 19, Server Components, Server Actions, TypeScript)
- **Prisma 7** — Rust-free `prisma-client` Generator + `@prisma/adapter-pg`
  (Driver-Adapter). Generierter Client liegt unter `app/generated/prisma`.
- **PostgreSQL** — läuft auf **Railway Postgres** (Schema bereits migriert).
- **Tailwind CSS v4** (`@tailwindcss/postcss`).
- **Auth:** E-Mail/Passwort mit `bcryptjs` + signierten Session-Cookies (`jose`/JWT).
- **Stripe** (`stripe@19`) — Checkout, Subscriptions, Connect inkl. Plattformgebühr;
  key-gated.
- **Resend** (Newsletter) — key-gated (`RESEND_API_KEY`).
- **OpenAI Embeddings** (KI) — optional; ohne Key läuft ein transparentes
  Keyword-Modell.
- **AWS S3** (`@aws-sdk/client-s3`) — Medien-/Datei-Uploads.
- **sanitize-html** — Bereinigung von Rich-Text.

## Wichtige npm-Skripte

| Skript | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver (localhost:3000) |
| `npm run build` / `start` | Production-Build / -Server |
| `npm run typecheck` | TypeScript-Prüfung (`tsc --noEmit`) |
| `npm run lint` | `next lint` |
| `npm run db:migrate` | neue Migration erstellen & anwenden |
| `npm run db:deploy` | Migrationen anwenden (Produktion) |
| `npm run db:rls` | RLS-Policies + `aera_app`-Rolle anlegen (`scripts/apply-rls.ts`) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:test` | Verbindungs-Smoke-Test (`scripts/test-database.ts`) |
| `npm run setup` | generate + migrate deploy + RLS |

`postinstall` erzeugt automatisch den Prisma-Client (`prisma generate`).

## Konfiguration (`.env`)

| Variable | Pflicht | Zweck |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres-TCP-URL |
| `AUTH_SECRET` | ✅ | Signiert Session-Cookies (32+ Zeichen; Prod: Zufallswert!) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | ✅ | Root-Domain für Subdomain-Tenants (`aera.so`) |
| `APP_URL` | ✅ | Basis-URL für Stripe-Redirects |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | — | aktiviert echte Zahlungen |
| `AERA_PLATFORM_FEE_PERCENT` | — | Plattformgebühr (Standard 5 %, Range 3–5 %) |
| `RESEND_API_KEY` | — | aktiviert echten Newsletter-Versand |
| `OPENAI_API_KEY` | — | hebt KI von Keyword- auf Embedding-Modell |

Alle Integrationen sind vollständig implementiert und schalten sich frei, sobald der
jeweilige Key gesetzt ist. Ohne Keys bleibt die App vollständig nutzbar.

## Datenbank

- **~40+ Modelle** in `prisma/schema.prisma` (u. a. User, Tenant, Membership, Space,
  Post, Comment, Reaction, MembershipTier, Product, Order, Subscription, Entitlement,
  Course/Lesson/LessonProgress, Event/EventRsvp, NewsletterCampaign/Segment/EmailEvent,
  GamificationRule/Level/Badge/BadgeAward/PointsLedger, LiveSession,
  Conversation/ConversationMember/ChatMessage/LiveChatMessage, MediaPackage/MediaItem,
  StorageObject, AssistantConversation/AssistantMessage, AiCreditWallet/Purchase/UsageEvent,
  AiContextChunk, Recommendation, HelpCategory/HelpArticle, KnowledgeArticle, AuditLog).
- Migrationen laufend erweitert (Chat/DMs, Group-Chat, Media-Packages, Space-Settings-JSON,
  Tenant-Layout, AI-Credits, Podcast/Links/Ads-Space-Types, Help-Center).

## Railway-Verbindung (wichtig)
- **Lokal:** `.env` nutzt die **öffentliche** Proxy-URL (`…proxy.rlwy.net`).
- **Auf Railway deployed:** `DATABASE_URL` auf die **interne** URL
  (`postgres.railway.internal`) setzen — nur intern erreichbar, schneller.
- Deploy: App-Service im selben Railway-Projekt, `DATABASE_URL = ${{ Postgres.DATABASE_URL }}`,
  Build `npm run build`, Start `npm run start`, einmalig `npm run db:deploy && npm run db:rls`.
- RLS-Laufzeit: Globale Systempfade nutzen die privilegierte Verbindung;
  Tenant-Abfragen wechseln transaktional via `SET LOCAL ROLE aera_app` und
  `aera.tenant_id` in die tatsächlich eingeschränkte Rolle.

## Stripe-Webhook (lokal)
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# ausgegebenes Signing-Secret als STRIPE_WEBHOOK_SECRET in .env
```

## Technische Constraints
- Postgres-Superuser & Table-Owner umgehen RLS → in Produktion über Rolle `aera_app`
  verbinden und pro Request `SET LOCAL aera.tenant_id = '<tenant>'` setzen.
- Keine Demo-Daten (`seed.ts` ist bewusst no-op).
