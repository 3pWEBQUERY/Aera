# Spaces — Analyse & ToDo

_Stand: 12. Juli 2026 · Bezug: `/dashboard/[slug]/spaces` (z. B. sex-studio)_

Aktuell anlegbar: **14 Space-Typen** (`SpacesManager` + Prisma `SpaceType`).  
`LiveSession` existiert im Schema, ist aber **kein** wählbarer Space-Typ.  
`CHAT` ist im Create-Dialog vorhanden, fehlt aber in Onboarding-Blueprints und im älteren `space-create-overlay`.

---

## Ist-Zustand

| Typ | Rolle heute | Reife | ToDo |
|---|---|---|---|
| **FEED** | Updates / Ankündigungen (Posts) | solide Basis | erweitern |
| **FORUM** | Reddit-ähnliche Threads + Moderation | stark | optional feilen |
| **BLOG** | Magazin/Artikel mit Layout-Settings | stark | optional feilen |
| **GALLERY** | Medien-Pakete, frei oder verkaufbar | stark | **Priorität erweitern** |
| **VIDEOS** | Video-Feed/Grid aus Posts | mittel | **Priorität erweitern** |
| **PODCAST** | Audio-Episoden + Player | mittel | erweitern |
| **COURSE** | Kurse, Lektionen, Drip, Online/Offline | stark | erweitern |
| **EVENTS** | Termine + RSVP | mittel | erweitern |
| **SHOP** | Produkte am Space | stark | erweitern |
| **NEWSLETTER** | Kampagnen-Archiv in der Community | mittel | erweitern |
| **KNOWLEDGE** | Hilfe/Doku mit Suche/Layout | stark | optional feilen |
| **CHAT** | Gruppen-Chat (+ Hub/DMs) | stark | erweitern + UX-Konsistenz |
| **LINKS** | Link-Hub | schlank, fertig | optional |
| **ADS** | Banner-Rotation auf der Startseite | schlank, fertig | erweitern |

---

## Priorität (Empfehlung)

1. [ ] **Erweitern:** Gallery/Videos (PPV/Teaser) + Feed (Scheduling / Pay-per-Post)
2. [ ] **Neu freischalten:** LIVE als Space (`LiveSession`-Modell nutzen)
3. [ ] **Neu bauen:** REQUESTS + BOOKING
4. [ ] **Danach:** Stories, Tips-Wall, Calendar

---

## Bestehende Spaces erweitern

### P1 — Gallery / Videos → PPV & Teaser

- [ ] Blur/Teaser für Nicht-Käufer
- [ ] Einzelpreis pro Clip/Set
- [ ] Bundle-Rabatte
- [ ] Ablaufdaten für Packages / Käufe
- [ ] Einheitliche Paywall-UX zwischen Gallery und Videos

### P1 — Feed → Creator-Timeline

- [ ] Gemischte Posts (Text / Bild / Video) klarer als Timeline
- [ ] Pin & Scheduling (geplante Veröffentlichung)
- [ ] Sichtbarkeit Gäste vs. Mitglieder vs. bezahlt **pro Post** (nicht nur Space-weit)
- [ ] Optionale Paywall pro Beitrag (PPV)

### P2 — Chat → Räume & Monetisierung

- [ ] Mehrere Rooms innerhalb eines Chat-Spaces
- [ ] Tip-Nachrichten / Shoutouts
- [ ] Slow-Mode-Presets
- [ ] VIP-only-Channels ohne eigenen Space-Typ
- [ ] Create-UX vereinheitlichen (Blueprints + Overlay + Manager)

### P2 — Events → Buchungen & Kapazität

- [ ] Ticketverkauf über Stripe
- [ ] Warteliste
- [ ] Kalenderansicht
- [ ] Erinnerungen (E-Mail / In-App)

### P2 — Course → Serien & Replay

- [ ] Kapitel als „Sets“ / Serien
- [ ] Fortschritts-Badges an Gamification koppeln
- [ ] Live-Replay anbinden (`streamUrl` / `replayUrl`)

### P3 — Podcast / Videos → Mediathek-Parität

- [ ] Serien / Staffeln
- [ ] Chapters
- [ ] Download für Mitglieder
- [ ] Bessere Cover- & Episode-Metadaten

### P3 — Shop → Downloads & Custom Orders

- [ ] Digitale Lieferungen zuverlässig ausspielen
- [ ] Wunschlisten-Produkte
- [ ] Produkttyp „Custom Request“

### P3 — Newsletter → Space-Segmentierung

- [ ] Kampagnen an Space / Tier koppeln
- [ ] Community-Archiv nicht nur Tenant-weite SENT-Mails zeigen

### P3 — Ads / Announcements

- [ ] Targeting nach Tier
- [ ] A/B-Rotation
- [ ] Klick-Stats / einfache Analytics

---

## Neue Spaces

### Sofort sinnvoll (Infrastruktur vorhanden)

- [ ] **LIVE** — `LiveSession` + Chat als Space: Schedule, Replay, Paywall, Nav-Eintrag
- [ ] **REQUESTS** — Mitglieder posten Wünsche; Creator nimmt an / lehnt ab / bepreist
- [ ] **CALENDAR** — Content-Kalender + Release-Termine (Drops, Lives, Events)
- [ ] **FAQ / Q&A** — kurze Fragen, Votes, Status „beantwortet“ (Forum-Variante, anderes UX)
- [ ] **MEMBERS** — Mitgliederwand mit Profilkarten, Level, Badges

### Stark für Fan- / Adult-Communities (z. B. Sex Studio)

- [ ] **STORIES** — kurzlebige Stories (24h), Engagement ohne Feed-Spam
- [ ] **TIPS / WALL** — Tipps, Shoutouts, Ziel-Fortschritt
- [ ] **BOOKING** — 1:1-Calls / Sessions (Slots + Stripe); Events bleiben gruppenorientiert
- [ ] **COLLECTIONS** — kuratierte Serien/Playlists über Gallery + Videos hinweg
- [ ] **POLLS / VOTES** — Community entscheidet nächstes Thema / Content

### Plattform-weit

- [ ] **REVIEWS** — Testimonials / Social Proof für Join-Seite
- [ ] **CHALLENGES** — zeitlich begrenzte Challenges mit Punkten/Badges
- [ ] **DIRECTORY** — Partner, Sponsoren, Ressourcen (strukturiertes LINKS+)
- [ ] **MAP / LOCAL** — Offline-Treffen & Locations (Course-Offline + Events)

---

## Technische Hinweise (bei Umsetzung)

- Enum `SpaceType` in `prisma/schema.prisma` erweitern
- Create-UI: `components/dashboard/spaces-manager.tsx` (+ ggf. `space-create-overlay.tsx` angleichen)
- Katalog: `lib/space-catalog.ts` (Onboarding-Blueprints)
- Validierung: `lib/validation.ts` → `spaceSchema`
- Assistant: `SPACE_TYPES` in `lib/assistant.ts`
- i18n: `dashboard.spaceTypes.*` in allen Katalogen
- Community-Render: `app/c/[slug]/s/[spaceSlug]/page.tsx`
- Dashboard-Manager: `app/(creator)/dashboard/[slug]/spaces/[spaceSlug]/page.tsx`

---

## Nächster Schritt (Spec)

Wenn Priorität klar ist, als Nächstes Produkt-Spec (Felder, Visibility, Dashboard vs. Community-UX) für eines von:

1. LIVE  
2. REQUESTS  
3. Gallery/Videos PPV  
4. BOOKING  
