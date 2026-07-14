# Code-Review aera.so — Status der Abarbeitung

Stand: 2026-07-02 · Typecheck: ✅ 0 Fehler · ✅ = behoben · 🔶 = teilweise · ⏳ = offen (mit Grund)

> **Nächster Schritt bei dir:** `npm run db:migrate` (3 ausstehende Migrationen: Kategorien, Tier-Cover, Performance-Indizes) und Dev-Server neu starten. `sanitize-html` wurde bereits per npm installiert.

## 🔴 Kritisch — alle behoben

| # | Befund | Status |
|---|---|---|
| 1 | AUTH_SECRET-Fallback | ✅ Prod failt hart ohne starkes Secret; `.env`-Secret rotiert |
| 2 | RLS wirkungslos | ✅ `set_config` pro Query (Prisma-Extension), Kontext in Guards/Actions/Routes; fehlende Tabellen in `apply-rls.ts`. ⏳ Manuell: App-DB-Rolle statt `postgres` (`CREATE ROLE aera_login LOGIN … IN ROLE aera_app`) |
| 3 | Paywall-Bypass (Gratis-Tier) | ✅ `hasPaidEntitlement` — nur bezahlte Tiers/Käufe erfüllen PAID |
| 4 | Stripe-Fallback verschenkt Inhalte in Prod | ✅ an `NODE_ENV !== production` gebunden; Checkout-Fehler fällt nie mehr auf Gratis-Grant zurück |
| 5 | Bezahlte Medien öffentlich | ✅ Visibility je Zweck, Entitlement-Check im Media-Proxy, private Cache-Header |

## 🟠 Hoch — alle behoben (außer #16)

| # | Befund | Status |
|---|---|---|
| 6 | Kommentar-Check vertraut Client-Slug | ✅ Autorisierung über `post.spaceId`; `parentId` validiert |
| 7 | Votes/Reaktionen ohne Tenant-Check + Punkte-Farming | ✅ Ziel per `{id, tenantId}` + `canAccess`; Punkte nur beim ersten Mal je Ziel (Ledger-Check) |
| 8 | Gebannte reaktivieren sich | ✅ BANNED-Check in `joinCommunityAction` |
| 9 | Open Redirect (`//evil.com`) | ✅ `safeNext` blockt `//` und `/\` |
| 10 | CSRF Mitglieder-Export | ✅ `Sec-Fetch-Site: cross-site` wird abgelehnt |
| 11 | Kein Rate-Limiting | ✅ Login 10/10 min, Signup 5/h pro IP (In-Memory; bei Multi-Instanz auf Redis wechseln). 🔶 Upload/Media-Proxy noch ohne Limit |
| 12 | Regex-HTML-Sanitizer | ✅ ersetzt durch `sanitize-html` (Parser-basiert, Tag+Attribut+Schema-Allowlist, `rel=noopener`) |
| 13 | Branding-Injection | ✅ Hex-Validierung serverseitig. 🔶 `escapeHtml` in lib/email escapt `"`/`'` noch nicht |
| 14 | Webhook: Idempotenz/Lifecycle | ✅ Dedupe per Stripe-IDs, try/catch; `subscription.deleted` entzieht Entitlement + stuft auf Default-Tier zurück; `subscription.updated` + `invoice.payment_failed` behandelt |
| 15 | Custom Domains funktionslos | ✅ Proxy löst Fremd-Hosts via `/api/resolve-domain` (60 s Cache) auf `/c/{slug}` auf |
| 16 | Admin-Mitglieder ohne Login-Weg | ⏳ Braucht Invite-/Passwort-Reset-Flow (E-Mail-Token) — eigenständiges Feature |
| 17 | Kein error.tsx/loading.tsx | ✅ `app/error.tsx`, `global-error.tsx`, Loading-Skeletons für Dashboard + Community |
| 18 | Lint/Tests/CI fehlen | ⏳ ESLint-Setup, Vitest, CI-Pipeline — Tooling-Projekt, bewusst nicht nebenbei |

## 🟡 Mittel

| # | Befund | Status |
|---|---|---|
| 19 | Fehlende `$transaction`s | 🔶 Kritische Atomarität gefixt (siehe 20); Multi-Write-Flows (deleteTier, Join, Fulfillment) laufen weiter sequenziell |
| 20 | Race Conditions | ✅ registerUser (P2002-Catch), Lagerbestand (atomares `decrement` in Action + Webhook), Kampagnen-Doppelversand (Status-Lock). 🔶 `sortOrder: count()` bleibt (kosmetisch) |
| 21 | deleteMember löscht Kauf-Entitlements | ✅ nur noch TIER/ROLE (auch beim Selbst-Verlassen) |
| 22 | Entitlement-Key-Kollision | ✅ Key aus finalem Slug |
| 23 | N+1/Performance | ✅ Empfehlungen 5-min-Cache (`unstable_cache`), `getCurrentUser`/`requireTenantAdmin`/`getCommunityContext` per `React.cache` request-dedupliziert. 🔶 `evaluateBadges` weiter sequenziell |
| 24 | Media-Proxy buffert 512 MB | ✅ echtes Streaming (`transformToWebStream`) |
| 25 | Mitgliederliste/Leaderboard öffentlich | ✅ beide nur für aktive Mitglieder/Staff (Startseite zeigt weiter Top 5) |
| 26 | Schema: Indizes/FKs/Typen | ✅ 8 Indizes (Schema + Migration `perf_indexes`). ⏳ MediaPackage/MediaItem-FK, onDelete-Regeln (DSGVO), `platformFeePercent` Float→Decimal, String→Enum — Breaking/Datenmigration, separat planen |
| 27 | Bild-Proxy offen, keine Header | ✅ `images.unoptimized`, Security-Header (X-Frame-Options, nosniff, Referrer-/Permissions-Policy) |
| 28 | Upload-Härtung | ✅ purpose-Allowlist + nosniff. ⏳ Magic-Byte-MIME-Check |
| 29 | Session-Staleness | ✅ Token trägt nur noch `userId`. ⏳ tokenVersion für serverseitige Revocation |
| 30 | Metadata fehlt | ✅ `generateMetadata` für Community (Name/Tagline/OG) + Dashboard, Title-Template Marketing |

## 🟢 Niedrig

✅ bcrypt-Cost 12 · ✅ revalidate-Lücken (Tiers→Join, RSVP-Pfad) · ✅ tsconfig excludet `app/generated` · ✅ A11y-Basics (focus-visible, aria-labels, Icons statt Emojis — Sweep aus UI-Phase) · ✅ Hover-only-Aktionen mobil sichtbar
⏳ `cn` ohne tailwind-merge · ⏳ `formatPrice`-Currency an allen Call-Sites · ⏳ `seed.ts` irreführend · ⏳ Admin-Vergabe nur durch Owner · ⏳ Datei-Splits (dashboard.ts, Space-Page) · ⏳ einheitliche ActionState-Patterns · ⏳ `lib/slug.ts` ts-expect-error

## Architektur-Empfehlungen (unverändert offen)

Action-Factory, Invite-Flow, Hintergrund-Queue (Newsletter/AI), Vitest + ESLint + CI, Modularisierung. Das sind eigenständige Projekte — nicht als Nebeneffekt eines Bugfix-Passes sinnvoll.
