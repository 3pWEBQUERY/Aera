---
name: Aeli Link-in-Bio
overview: Neues Produkt **Aeli** auf der Domain **aeli.so** (öffentliche Seiten als `{handle}.aeli.so`), in derselben Next.js-App und derselben PostgreSQL-DB wie Aera — mit eigenem Editor, First-Class-Link-Schema und Smart-Blocks, die Linktree überbieten und nahtlos in Aera-Communities einbinden.
todos:
  - id: schema-aeli
    content: "Prisma: AeliProfile, AeliBlock, AeliClick, AeliLead + Migration + RLS/user-scoped policies"
    status: pending
  - id: proxy-aeli-domain
    content: "proxy.ts + env: aeli.so apex und {handle}.aeli.so Rewrite; Reserved Handles"
    status: pending
  - id: auth-onboarding
    content: Aeli Signup/Login (shared User) + Handle-Claim-Onboarding
    status: pending
  - id: studio-mvp
    content: "Studio-Editor: DnD Blocks, Themes, Preview, Publish"
    status: pending
  - id: public-page
    content: Public Page auf {handle}.aeli.so inkl. SEO/OG und Click-Tracking
    status: pending
  - id: analytics
    content: Click-Ingest + Analytics-UI (Zeitreihe, Top-Links, Referrer)
    status: pending
  - id: community-bridge
    content: linkedTenantId + COMMUNITY_CTA / LIVE_NOW Blocks
    status: pending
  - id: aeli-marketing
    content: Marketing-Landing aeli.so mit Brand-first Hero und CTA Handle sichern
    status: pending
isProject: false
---

# Aeli — Link-in-Bio auf aeli.so

## Produktentscheidungen (festgelegt)

- **Marke / Domain:** Eigenes Produkt **Aeli** auf `aeli.so`. Öffentliche Seiten: **`{handle}.aeli.so`**.
- **Wer darf?** Jeder, der sich auf Aeli registriert **und** bestehende Aera-Creator (Community-Owner) — ein gemeinsames `User`-Konto, geteilte DB.
- **Nicht:** Community-Subdomains auf `aera.so` umbiegen. Aera bleibt Community-OS; Aeli ist die leichte „eine Seite, alle Links“-Fläche mit Upgrade-Pfad in die Community.

## Architektur

Gleiche App, Host-Routing (kein separates Repo):

```mermaid
flowchart LR
  subgraph hosts [Hosts]
    apexAeli["aeli.so"]
    handleAeli["handle.aeli.so"]
    apexAera["aera.so"]
    tenantAera["slug.aera.so"]
  end
  subgraph app [Next.js App]
    aeliRoutes["/aeli/* Editor + Marketing"]
    publicBio["/aeli/p/[handle] Public"]
    community["/c/[slug] Community"]
  end
  DB [("PostgreSQL / Prisma")]
  apexAeli --> aeliRoutes
  handleAeli -->|"proxy rewrite"| publicBio
  apexAera --> community
  tenantAera --> community
  aeliRoutes --> DB
  publicBio --> DB
  community --> DB
```

**Proxy-Erweiterung** in [`proxy.ts`](proxy.ts):

- Host `aeli.so` / `www.aeli.so` → Aeli-Marketing + Auth + Editor (keine Community-Rewrite).
- Host `{handle}.aeli.so` → Rewrite auf interne Public-Route (z. B. `/aeli/p/{handle}`), analog zu Tenant-Rewrite für `*.aera.so`.
- Reserved Labels: `www`, `app`, `api`, `admin`, `login`, `signup`, `static`, `cdn`, `mail`, `status`, …
- Env: `NEXT_PUBLIC_AELI_ROOT_DOMAIN=aeli.so` (neben bestehendem `NEXT_PUBLIC_ROOT_DOMAIN` für Aera).
- Session-Cookie: für Aeli auf `.aeli.so` scopieren (wie heute `.aera.so` in [`lib/session.ts`](lib/session.ts)); Cross-Login Aera↔Aeli später via shared User + „Mit Aera fortfahren“ / Magic-Link — **MVP: getrenntes Cookie pro Root-Domain, gleiches Passwort/Konto**.

**DNS / Infra (Railway):** Wildcard `*.aeli.so` → dieselbe App-Instanz; Apex `aeli.so` ebenfalls. TLS Wildcard (Railway/Cloudflare).

## Datenmodell (First-Class, nicht JSON wie LINKS-Space)

Neue Tabellen in [`prisma/schema.prisma`](prisma/schema.prisma) + Migration + RLS-Patterns analog [`prisma/security/rls.sql`](prisma/security/rls.sql). Aeli ist **user-scoped** (nicht `tenantId`); Isolation über `userId` / öffentliche Read-Policies nur für `PUBLISHED`.

| Modell | Zweck |
|--------|--------|
| `AeliProfile` | 1:1 mit `User`: `handle` (unique, subdomain-fähig), `displayName`, `bio`, `avatarUrl`, `theme` (Json), `status` (DRAFT/PUBLISHED), `linkedTenantId?`, SEO-Felder, `publishedAt` |
| `AeliBlock` | Bausteine der Seite: `type`, `title`, `subtitle`, `href`, `mediaUrl`, `icon`, `config` (Json), `sortOrder`, `isVisible`, `startsAt`/`endsAt` (Scheduling) |
| `AeliClick` | Analytics-Events: `blockId`, `profileId`, `ts`, `referrer`, `uaHash`, `country?`, `device` — append-only, aggregierbar |
| `AeliLead` | E-Mail-/Contact-Captures aus Lead-Blöcken |

**Block-Typen (MVP+):** `LINK`, `HEADER`, `SOCIAL_ROW`, `DIVIDER`, `EMBED`, `COMMUNITY_CTA`, `NEWSLETTER`, `TIP`, `PRODUCT`, `BOOKING`, `LIVE_NOW`, `MUSIC`, `CONTACT`, `QR_SHARE`.

Handle-Regeln: `slugify`-ähnlich, 3–30 Zeichen, `[a-z0-9-]`, Collision-Check gegen Reserved + existierende Profiles; **kein** Zwang, mit Tenant-`slug` identisch zu sein — optional „Community-Handle übernehmen“.

Bestehenden LINKS-Space (`Space.settings` JSON) **nicht** als Storage nutzen; ggf. später „Links aus Community importieren“.

## Oberflächen

| Fläche | Route / Host | Inhalt |
|--------|----------------|--------|
| Marketing | `aeli.so/` | Eigenes Aeli-Landing (nicht Aera-Marketing kopieren): Brand first, ein Hero, CTA „Handle sichern“ |
| Auth | `aeli.so/signup`, `/login` | Shared `User`-Tabelle; Copy/Branding Aeli; nach Signup Onboarding Handle → Theme → erster Link |
| Editor | `aeli.so/studio` (auth) | Split: Live-Preview (Phone-Frame) + Block-Liste (DnD), Theme-Panel, Analytics-Drawer |
| Public | `{handle}.aeli.so` | Max. performante RSC-Seite, Edge-cachefreundlich, OG/Twitter Cards |
| Bridge | Block `COMMUNITY_CTA` | Deep-Link zu `tenantPublicUrl()` auf Aera — Join, Live, Shop |

Editor-UX an bestehende Patterns anlehnen ([`components/dashboard/links-manager.tsx`](components/dashboard/links-manager.tsx), Layout-Editor), aber **eigene** Aeli-Komponenten unter `components/aeli/` + `app/aeli/`, damit Community-Dashboard nicht vermischt wird.

## Design-Richtung (Aeli ≠ generisches Linktree)

- Eigene CSS-Variablen (`--aeli-*`), expressive Typo (kein Inter-Default für Public Pages), atmosphärischer Hintergrund (Gradient/Texture), starke Motion (2–3 gezielte Reveals/Hover).
- Themes als kuratierte Presets + Feintuning (Farbe, Radius, Button-Style, Font-Paar) — nicht 200 Template-Klone.
- Public Page: eine Komposition, Avatar+Name als Hero-Signal, Links als klare CTAs — **keine Card-Suppe**, keine Badge-Overlays.

## Features, die Linktree schlagen (phasiert)

### Phase 1 — Launch (muss sich besser anfühlen als Linktree Free)

1. `{handle}.aeli.so` + Handle-Claim im Onboarding  
2. Studio: DnD-Blöcke, Thumbnails/Icons, Sichtbarkeit, Scheduling  
3. Themes + Mobile-Preview + QR zum Teilen  
4. Click-Analytics (Zeitreihe, Top-Links, Referrer, Device) — Privacy: kein Raw-IP-Store, Hash/Aggregation  
5. Social-Row + Embeds (YouTube/Spotify o. Ä. allowlist)  
6. SEO: Title/Description/OG-Image pro Profil  
7. Community-Bridge: Creator verknüpft `linkedTenantId` → Block „Community beitreten“ / „Jetzt live“  
8. i18n (next-intl) für Aeli-Surface, DE/EN zuerst  

### Phase 2 — Monetize & Smart

- Tip-Block (Stripe Connect des Users/Tenants wiederverwenden wo vorhanden)  
- Newsletter-/Lead-Capture → `AeliLead` + optional Sync in Aera-NEWSLETTER-Space  
- Product-Block aus Aera-Shop; Booking-Block aus BOOKING-Slots  
- `LIVE_NOW`-Badge wenn Tenant eine laufende LiveSession hat  
- Smart Sort: „Meistgeklickt oben“ Toggle; A/B zweier URLs an einem Block  
- Gate: Passwort / Altersfreigabe / E-Mail vor Unlock  

### Phase 3 — Scale

- Custom Domain auf Aeli-Profil (CNAME, Verify wie [`lib/domains.ts`](lib/domains.ts))  
- Aeli Pro (Stripe): mehr Themes, Custom Domain, erweiterte Analytics, Remove-Branding  
- Import aus Linktree (CSV/URL-Parse)  
- Team/ collab edit; API keys für Blöcke  

## Auth & Entitlements

- Registrierung legt `User` + leeres `AeliProfile` (Handle reserved) an.  
- Bestehende Aera-User: „Einloggen“ auf `aeli.so` mit denselben Credentials → Profil anlegen falls fehlend.  
- Freemium-Default: unbegrenzt Links, Aeli-Branding im Footer, Basis-Analytics.  
- Pro später; Community-Owner mit Aera PRO+ können Bridge-Blöcke und Branding-Removal früher freischalten (an [`lib/plan-features.ts`](lib/plan-features.ts) andocken).

## Wichtige Integrationspunkte (bestehender Code)

- Host-Routing: [`proxy.ts`](proxy.ts)  
- Session/Cookie-Domain: [`lib/session.ts`](lib/session.ts), [`lib/auth.ts`](lib/auth.ts)  
- Uploads (Avatar/Thumbnails): bestehender S3 + ClamAV-Pfad  
- Tenant-Bridge: [`lib/tenant.ts`](lib/tenant.ts), [`lib/seo.ts`](lib/seo.ts) `tenantPublicUrl`  
- Stripe Connect / Tips: vorhandene Tip-/Connect-Flows wiederverwenden, nicht neu erfinden  
- Reserved-Slug-Listen erweitern (Aera `app`/`www`/… + Aeli-eigene)

## Delivery-Schnitt (empfohlen zuerst implementieren)

1. Schema + RLS + Handle-Reservation  
2. Proxy `aeli.so` / `*.aeli.so`  
3. Public Page + Studio MVP (LINK/HEADER/SOCIAL + Theme)  
4. Analytics-Ingest (beacon/action) + einfaches Dashboard  
5. Aeli-Marketing-Landing + Signup-Onboarding  
6. Community-CTA + optional LIVE_NOW  

Danach Phase-2-Blöcke iterativ.

## Nicht im Scope von Phase 1

- Eigenes Mobile-App-Binary nur für Aeli  
- Separates Deployment/Microservice  
- Ersetzung des Community-LINKS-Space (bleibt für In-Community-Hubs)  
- Vollständige Feature-Parität mit allen Aera-Spaces auf einer Bio-Seite  
