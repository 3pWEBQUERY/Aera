# Progress — Aera

_Zuletzt aktualisiert: 29. Juli 2026_

## Was funktioniert (implementiert)

Laut Projekt-Status ist Aera eine **voll funktionsfähige** Anwendung, kein Prototyp.

### Kernplattform
- ✅ Multi-Tenancy: Application-Layer-Scoping pro Tenant + RLS mit
  least-privilege-Rolle `aera_app` (Defense-in-Depth, auch bei DB-Owner-URL).
- ✅ Auth: Signup/Login, E-Mail/Passwort, Session-Cookies, Passwort-Reset
  (`/forgot`, `/reset/[token]`), Einladungen (`/invite/[token]`), E-Mail-
  Verifizierung, TOTP-2FA.
- ✅ Onboarding: Community anlegen unter `/start` mit vollständigem Space-Katalog
  in Plan-Reihenfolge und Abbruch-Möglichkeit.
- ✅ Tenant-Auflösung: Pfad `/c/[slug]`, Subdomain via `proxy.ts`, Custom Domains
  mit DNS-Verifizierung.
- ✅ Plattformweite Währung (Default **CHF**) für Billing, Anzeige und Verkauf.
- ✅ Plattform-Admin: persistente DB-Rolle `User.platformRole=ADMIN` + verifizierte
  E-Mail + TOTP; sichere Provisionierung via `admin:grant`/`admin:revoke`/`admin:status`.

### Community & Inhalte — 21 Space-Typen
- ✅ Feed, Forum, Kurs, Shop, Newsletter, Events, Blog, Wissen, Galerie, Videos,
  Chat, Podcast, **Musik**, Links, Werbung (Ads), **Live**, **Requests**,
  **Booking**, **Stories**, **Tips (Trinkgeld)**, **Kalender**.
- ✅ Beiträge: Text/Bild/Video, **mehrere Bilder je Beitrag**, Titelbild mit
  Fokuspunkt-Crop + Zoom, Per-Post-Einstellungen, Sichtbarkeits-Steuerung,
  HTML-Body; gesperrte Beiträge mit verwischtem Titelbild.
- ✅ Kommentare mit Antworten, Gefällt-mir + Emoji-Auswahl; Reaktionen.
- ✅ **Umfragen** an Forum-Themen und Blog-Beiträgen.
- ✅ **Rich-Text-Editor**: Slash-(/)-Menü, Divider, Emoji-Picker, In-Browser-
  Videoaufnahme, GIF-Picker (Tenor/Giphy), Dateianhänge.
- ✅ Forum: Rich-Editor-Themen, Umfragen, Kommentar-Reaktionen.
- ✅ Blog: Monetarisierung, Titelplatte, „Ähnliche/Beliebte Posts", geplante
  Beiträge mit Creator-Zeitzone.
- ✅ Ankündigungen/Banner pro Space; Sichtbarkeit je Space: öffentlich/Mitglieder/bezahlt.
- ✅ **Stories** (optional dauerhaft), **Kalender** (Termine per Popover).
- ✅ **Musik**: Titel mit Cover + Player, verkaufbar (Berechtigungsschlüssel + Suchindex).
- ✅ **Tips**: Trinkgeld-Fluss mit CHF-Beträgen und Vollbild-Popover.
- ✅ Bibliothek, Mitglieder-Verzeichnis, Leaderboard, Community-Startseite mit
  Feed-Lesefläche, wählbarer Kopfzeile (Mosaik, eigene Bilder).

### Live-Streaming
- ✅ **Live über Aera streamen** (Cloudflare Stream Live): Browser-WebRTC/WHIP-
  Ingest ohne Drittsoftware, OBS optional; Customer-Code auch als Adresse.
- ✅ Live-Session-Popover mit Plattform-Auswahl (Original-Logos), Tier-basiertem
  Zugriff, Countdown bis zum Start, Plattform-Embeds (inkl. CSP-`frame-src`).
- ✅ Dynamischer Live-Room (Player/Chat größenverstellbar), Startseiten-Sektion
  als 2er-Slider.
- ✅ Doku: `docs/live-streaming-setup.md`.

### Monetarisierung
- ✅ Mitgliedschaften (Tiers): kostenlos & bezahlt, monatlich/jährlich/einmalig.
- ✅ Digitale/physische Produkte, Bundles, Course-Access, Tier-Grant, Musik-Verkauf,
  Trinkgeld, bezahlte Blog-Beiträge.
- ✅ Zentrale Entitlements (TIER/PURCHASE/MANUAL/ROLE).
- ✅ Stripe Checkout + Connect inkl. Plattformgebühr; fail-closed für bezahlte
  Checkouts (vollständig aktiviertes Connect-Konto erforderlich); Disputes
  entziehen Zugriffe/Credits/Punkte/Provisionen idempotent.
- ✅ **Creator-Tarife** (STARTER/PRO/SCALE, feste Stripe-Price-IDs), Promo-Codes,
  Plan-Gating für Space-Typen, Admin kann Community-Paket setzen; Auszahlungen
  (`/dashboard/[slug]/payouts`).
- ✅ Apple-IAP-Preispunkte (`db:snap-prices`).

### Kommunikation & Support
- ✅ Newsletter: Kampagnen + Segmente, Text/HTML-Umschalter mit exakter
  HTML-Vorschau, ausfallsichere Postgres-Empfänger-Queue (Leases, Idempotency,
  Backoff), nachweisbares Opt-in mit One-Click-Unsubscribe, Bounce-/Complaint-
  Suppression via Resend-Webhook.
- ✅ Chat: DMs + Gruppen, SSE-Echtzeit (Polling-Fallback); Live-Sitzungen.
- ✅ **Support-Ticket-System** für Besucher, Mitglieder und Team, mit
  E-Mail-Benachrichtigung.
- ✅ In-App-Benachrichtigungen (Glocke, Unread-Badge) + optionale Web-Push (VAPID).
- ✅ Automationen (Onboarding-Serien, Platzhalter, Cron), Drip-Lektionen.

### Medien & Studio
- ✅ Mediathek: Galerie, Videos, Podcast, Media-Packages.
- ✅ Creator Media-Bibliothek (`/dashboard/[slug]/media`): alle Tenant-Uploads,
  Ordner, DnD, Umbenennen/Löschen; Upload-Anzeige unten rechts.
- ✅ AI-Assistent: Chat + Bild-Modus (getrennte Verläufe, `AssistantConversation.kind`),
  `/media`-Slash-Command + multimodaler Chat, Gemini (`gemini-3.1-flash-image`),
  Referenzbilder, Credits-Abrechnung; Gemini-Ausgaben in aktiver Sprache.

### Wachstum & Verwaltung
- ✅ Gamification: Punkte-Regeln, Level, handgezeichnete Badge-Plaketten, Streaks,
  Leaderboard; Badge-Vergabe per Knopf in der Mitgliederliste.
- ✅ Analytics (MRR, Churn, Umsatz, Wachstum, Engagement, Kurs-Abschlüsse,
  Newsletter-Performance), Referral-Programm mit Provisionen.
- ✅ Öffentliche Read-only-API (`/api/v1/`, API-Keys) + ausgehende Webhooks
  (HMAC-signiert, SSRF-geschützt).
- ✅ **SEO-Einstellungen** für Plattform und Communities (Social-Bild-Upload);
  Sitemap, Robots, dynamische OG-Images.
- ✅ Entdecken: `/home` mit plattformweiter Live-Suche `/home/search`.
- ✅ Mitgliederverwaltung (Rollen/Status), Moderation (KI-Vorprüfung + Heuristik,
  nie Auto-Löschung).
- ✅ Branding & Layout-Editor mit Live-Preview; Spaces-Übersicht mit
  Raster-/Listenansicht.
- ✅ Datenexport (JSON, auch Streaming-Exporte); passwortgeschützte Konto- und
  Community-Löschung mit Lifecycle-Phasen (Stripe, Retention, S3-Outbox).
- ✅ Hilfe-Center, Rechtsseiten (/impressum /agb /datenschutz /widerruf),
  Audit-Log (append-only `aera_write_audit`).

### Betrieb & Härtung
- ✅ Sichere Direkt-Uploads: SHA-256 streamend, atomare Kontingent-Reservierung,
  15-min signierte S3-PUT-URLs, Magic-Byte- + ClamAV-Prüfung, Upload-Cron.
- ✅ Secret-Verschlüsselung: AES-256-GCM-Keyring (TOTP/Webhook), rotationssicher.
- ✅ Cron-Monitoring: 7 parallele Jobs (posts, newsletters, webhooks, automations,
  inventory, uploads, lifecycle) mit persistenten Heartbeats, `/api/cron/status`
  (503 bei überfälligen Jobs), eigene Railway-Cron-/Backup-Services.
- ✅ Verschlüsselte Offsite-Backups (`db:backup`) + Restore-Drill (`db:restore-drill`).
- ✅ Progressive Env-Validierung (fail-fast nur wo kritisch), `npm run env:check`.
- ✅ Rate-Limits (Redis/In-Memory-Fallback), Resend-/Stripe-Webhook-Verifikation.

### Verifikation (aktuell, 29.07.2026)
- ✅ TypeScript: 0 Fehler; ESLint grün.
- ✅ **Vitest: 508/508 Tests** (68 Dateien) grün.
- ✅ Playwright: 5/5 Chromium-E2E-Flows.
- ✅ `next build`: erfolgreich.
- ✅ **79 Migrationen**; RLS-Policies, Grants und Audit-Grenze verifiziert
  (`db:rls` prüft nur noch, Policies liegen in Migrationen).
- ✅ CI (GitHub Actions): Env-Vertrag, Migrationen, RLS-/Outbox-Smokes, Lint,
  tsc, Tests, Build, `npm audit --audit-level=high` als Deployment-Gate.

## Was noch offen / zu prüfen ist

- ⏳ „Space" vs. „Bereiche": Sprachvereinheitlichung in Hero/Marquee der Startseite
  noch offen (Fließtexte bereits umgestellt).
- ⏳ README-Metadaten hinterher (Tabellen-/Testzahlen, `middleware.ts`→`proxy.ts`).
- ⏳ Rechts-Offenpunkte (Anwalt): EU-Vertreter Art. 27 DSGVO, DE-USt/OSS, AVV-Muster.
- ⏳ Live-Streaming: End-to-End gegen echten Cloudflare-Account verifizieren.
- ⏳ `Tenant.locale` als Community-Default (Idee).

## Bekannte Hinweise / Fallstricke

- RLS wird von Superuser/Table-Owner umgangen → Tenant-Pfade wechseln pro
  Transaktion via `SET LOCAL ROLE aera_app` in die eingeschränkte Rolle.
- Lokal: öffentliche Railway-Proxy-URL; auf Railway: interne URL verwenden.
- Launchkritische Pfade sind fail-closed: Zahlungen brauchen Stripe+Webhook,
  Secrets den Keyring, Uploads privaten S3 + ClamAV.
- Cron-Endpunkte nur `POST` + Bearer `CRON_SECRET` (keine Query-Secrets).
- i18n-Test-Eigenheit: ICU-Plural-Zweige müssen mit `#` beginnen; neue UI-Texte
  immer in DE+EN (alle 17 Vollkataloge) anlegen.

## Meilenstein-Log

- **29.07.2026 — Live über Aera streamen (Cloudflare Stream Live):** Der
  bestehende Space-Typ LIVE bekommt eine echte Stream-Quelle mit
  Browser-WebRTC/WHIP-Ingest (kein OBS nötig); `lib/cloudflare-stream.ts`
  (Live-Inputs, WHIP-URL, Playback), Migrationen
  `20260729100000_live_source` + `20260729120000_live_ingest`; Customer-Code als
  Adresse akzeptiert; Setup-Doku `docs/live-streaming-setup.md`.
- **28.07.2026 — Cloudflare-Live-Basis, Badges, Spaces-Übersicht:** „Live über
  Aera streamen" (`lib/cloudflare-stream.ts`, Live-Manager-Ausbau); handgezeichnete
  Badge-Plaketten + Badge-Vergabe per Knopf in der Mitgliederliste; Spaces mit
  Raster-/Listenansicht, alphabetische Space-Typen, Symbole aus einer Quelle.
- **27.07.2026 — MUSIC, Stories, Feed/Blog/Kommentar-Ausbau:** Space-Typ
  MUSIC (Musik verkaufen, Suchindex), Stories optional dauerhaft, mehrere Bilder
  je Feed-Beitrag, gesperrte Beiträge mit verwischtem Cover, Feed-Lesefläche auf
  der Startseite, Kommentar-Antworten + Gefällt-mir/Emoji, wählbare Community-
  Kopfzeile, Upload-Anzeige unten rechts, i18n-Test-Fix (26 Übersetzungen).
- **25./26.07.2026 — Support-Tickets, SEO, Blog-Monetarisierung:** Ticket-System
  (Besucher/Mitglieder/Team) mit Mail-Benachrichtigung; SEO-Einstellungen +
  Social-Bild-Upload; Admin setzt Community-Paket; plattformweite Suche
  `/home/search`; Marketing-Vergleichsbereich; Dashboard-Live-Suche; Blog-
  Monetarisierung/Umfragen/Titelplatte/Ähnliche Posts; Post-Sichtbarkeit
  (`20260726100000_post_visibility`); Session-/Proxy-Routing-Fixes.
- **23./24.07.2026 — Plan-Gating, Onboarding-Katalog, 404:** Creator-Plan-Gating,
  Promo-Codes, Space-Type-Picker; vollständiger Space-Katalog im Onboarding;
  404-Seite mit Vollbild-Rotation; next 16.2.11 + Audit-Overrides.
- **21./22.07.2026 — Kalender, Tips, Live-Embeds, Newsletter-Ausbau:** Kalender-
  Space komplett; Tips-Space (CHF-Beträge, Vollbild-Popover); Live-Session-
  Popover mit Plattform-Auswahl/Logos, Tier-Zugriff, CSP-`frame-src`, dynamischer
  Live-Room, Countdown; Newsletter Text/HTML-Umschalter + Kampagnen-Popover +
  Segmente-Tab; UI-Vereinheitlichung rounded-xl + Aktionsfarbe `#d8cfef`.
- **20.07.2026 — Roadmap Punkt 4 (Recht und Produktqualität):** Separates,
  nachweisbares Newsletter-Opt-in mit One-Click-Unsubscribe und
  Bounce-/Complaint-Suppression; versionierte AGB-/Datenschutznachweise und
  gesonderte Sofortzugangsbestätigung für digitale Käufe; Nutzer- und
  Tenant-Streaming-Exporte; passwortgeschützte, wiederaufnehmbare Konto- und
  Community-Löschung inklusive Stripe-, Retention- und S3-Outbox-Phasen sowie
  automatischem Retention-Purge. Globale Rechts-/Kontopfade funktionieren auch
  auf Sub- und Custom Domains. Accessibility-Basis (Skip-Link, Fokusführung,
  Dialog-Trap, Live-Fehler) und Playwright-CI mit fünf kritischen Browserflows.
  Alle 19 Sprachkataloge enthalten die neuen Rechts-/Einwilligungstexte.
  434 Vitest- und 5 Playwright-Tests, TypeScript, ESLint und Production-Build
  grün; 63/63 Railway-Migrationen und 71 RLS-Policies verifiziert.
- **19.07.2026 — Produktions-Härtung, Rich-Editor, CHF-Währung:** Direkt-Uploads
  Browser→S3 mit SHA-256/Kontingent/ClamAV; AES-256-GCM-Keyring für Secrets;
  RLS-Härtung (Least-Privilege, Subdomains); Cron-Heartbeats +
  `/api/cron/status`; verschlüsselte Offsite-Backups + Restore-Drill; Railway-
  Deploy-Serie (Cron-Service, progressive Env-Validierung); Plattform-Admin-
  Provisionierung (`admin:grant/revoke`); Apple-IAP-Preispunkte; Rich-Editor
  (Slash-Menü, Emoji, Video, GIF, Anhänge), Forum-Polls, Composer-Titelbild;
  plattformweite CHF-Währung.

<details>
<summary>Ältere Meilensteine (05.–12. Juli 2026)</summary>

- **12.07.2026 (3)** — AI-Assistent: `/media`-Slash-Command + multimodaler Chat
  (Referenzbilder in Chat- und Bild-Modus, Media-Picker, max 4 Bilder ≤5 MB,
  User-Message als JSON `{text, attachments}`); 7 neue i18n-Keys in 17 Katalogen.
- **12.07.2026 (2)** — Dashboard-Button-Konsistenz: geteilte `Button`-Komponente
  (`--brand`=Violett) in referrals/developers durch native Slate-Buttons ersetzt;
  automations „Schritt hinzufügen" auf `rounded-xl`.
- **12.07.2026** — Finale-Abschnitt mit Video-Hintergrund (`videos/4.mp4` →
  WebP-Frames `public/finale/`, `FINALE_CLIPS`, radiales Overlay).
- **11.07.2026 (2)** — Bewegter Hero-Hintergrund: `videos/{1,2,3}.mp4` mit
  FFmpeg zu WebP-Frame-Sequenzen extrahiert (fps=12, 120 Frames/Clip,
  `public/hero/<n>/`; PNG→cwebp, da ffmpeg-Build ohne libwebp). Neue
  Client-Komponente `hero-frame-background.tsx` spielt die Frames ab und
  wechselt automatisch per Cross-Fade zum nächsten Clip (Endlosschleife,
  prefers-reduced-motion → Standbild); Manifest `hero-clips.ts`;
  Reproduktions-Skript `scripts/hero-frames.sh`. Header-Overlay-Fix via `-mt-20`.
- **11.07.2026** — Startseiten-Kapitel von 6 auf 7 erweitert: c5 „Studio,
  Mediaspeicher und KI", c6 „Motivation, die aktiv hält", c7 „Alles unter deiner
  Marke". Alle 17 Vollkataloge übersetzt; en-GB-Override auf c7 verschoben.
- **10.07.2026 (17)** — Creator Media Library: `/dashboard/[slug]/media`
  (Nav „Medien"), `MediaFolder` + `StorageObject.folderId/displayName`
  (Migration `20260711060000_media_folders`), Ordner-Accordion, DnD,
  ⋯-Menüs, Sheets, Filter + Suche.
- **10.07.2026 (16)** — Kritische Launch-Härtung (Migration
  `20260711050000_launch_security_hardening`): bezahlte Marketplace-Checkouts
  fail-closed (voll aktiviertes Connect-Konto), Stripe-v19-Invoices über
  `parent.subscription_details`, `past_due` suspendiert Zugriff, Disputes
  entziehen Vorteile idempotent, Webhook-SSRF-Schutz (DNS-Rebinding, Redirects),
  Tenant-Prisma via interaktiver Transaktion zu `aera_app`, Plattform-Audits
  über `aera_write_audit`, AutomationDelivery-User-FK + faire Enqueue-Reihenfolge.
- **10.07.2026 (15)** — Verbliebene i18n-Migration abgeschlossen: Token-Seiten,
  Onboarding, Metadaten, PWA-Manifest, transaktionale E-Mails, Dashboard-Uploads.
  Rechtstexte bleiben deutsch (Vertragssprache).
- **10.07.2026 (14)** — Newsletter-Versand ausfallsicher (Migration
  `20260711040000_reliable_newsletter_delivery`): unveränderliche Empfänger-Queue
  `NewsletterDelivery`, 5-Min-Leases, Resend-Idempotency-Keys, max 5 Versuche,
  deduplizierte Events, SENDING bis Abschluss, Cron `/api/cron/newsletters`,
  RLS auf 51 Tenant-Tabellen.
- **10.07.2026 (13)** — Rechtstexte-Audit (Schweizer Betreiber, Bülach ZH):
  Impressum (UWG + DDG), AGB §2 KI-Klausel + §10 + §13 Rechtswahl,
  Datenschutz revDSG + §§3/6/7/10/11, Widerruf EU/EWR.
- **10.07.2026 (12)** — Rechtsseiten + Footer-Spalte „Aera.so":
  /impressum, /agb, /datenschutz, /widerruf (deutsche Vorlagen mit
  [Platzhaltern], bewusst nicht i18n-lokalisiert). Sitemap ergänzt.
- **10.07.2026 (11)** — i18n-Abschluss: Plattform-Admin. Namespace `admin` +
  14 `errors`-Keys, alle 17 Kataloge. Damit i18n-Migration der GESAMTEN
  Anwendung abgeschlossen.
- **10.07.2026 (10)** — Dashboard-i18n Teil 7: AI-Assistent-Workspace
  (`dashboard.assistant` + suggestions/imageSuggestions).
- **10.07.2026 (9)** — Dashboard-i18n Teil 6 Batch 6: `announcements`,
  `spaceContent` — Space-Content-Block fertig.
- **10.07.2026 (8)** — Space-Content Batch 5: `chat`, `newsletter` (+status).
- **10.07.2026 (7)** — Space-Content Batch 4: `ads`, `forumMod`.
- **10.07.2026 (6)** — Space-Content Batch 3: `courses`, `gallery`.
- **10.07.2026 (5)** — Space-Content Batch 2: `blog`, `knowledge` + `sortLabels`.
- **10.07.2026 (4)** — Space-Content Batch 1: `rte`, `links`, `events`.
- **10.07.2026 (3)** — Dashboard-i18n Teil 5: Einstellungen (`settings`,
  `branding`, `domain`, `danger`, `developers`, `export`, `moderation`, `layout`).
- **10.07.2026 (2)** — Dashboard-i18n Teil 4: Wachstum (`analytics`,
  `gamification`, `referrals`, `automations`).
- **10.07.2026** — Dashboard-i18n Teil 3: Monetarisierung (`tiers`, `products`,
  `payouts`, `productTypes`, `tierIntervals`, `orderStatus`).
- **09.07.2026 (3)** — Dashboard-i18n Teil 2: Mitglieder (`members`,
  `memberStatus`).
- **09.07.2026 (2)** — Dashboard-i18n Teil 1: Chrome + Spaces (`overview`,
  `topbar`, `userMenu`, `search`, `subscription`, `credits`, `roles`,
  `spaceTypes`, `visibility`, `spaces`).
- **09.07.2026** — i18n-Fertigstellung kundenseitig: `errors` (Server-Actions
  via `lib/action-errors.ts`), `library`, `help`, `account`, `dashboard.nav`.
- **08.07.2026 (8)** — Space-Chrome mehrsprachig: Namespace `spaces`;
  `timeAgo`/`formatDate`/`formatDateTime` mit locale-Parameter.
- **08.07.2026 (7)** — Community-Kernseiten: `joinPage`, `members`,
  `leaderboard`, `invite`.
- **08.07.2026 (6)** — Entdecken (/home): `discover`, `categories` (12 Themen).
- **08.07.2026 (5)** — Features-Seite mehrsprachig (13 Sektionen) +
  Sprach-Popover im Marketing-Header.
- **08.07.2026 (4)** — Auth- & Preise-Seite: `authPages`, `pricing`.
- **08.07.2026 (3)** — Startseite komplett: Namespace `marketing`
  (Header/Footer/Mobile).
- **08.07.2026 (2)** — i18n-Ausbau: 19 Sprachen + Startseite übersetzt
  (Fallback-Kette `localeChain`, 17 Vollkataloge + 2 dünne Overrides).
- **08.07.2026** — i18n-Grundstein (next-intl ohne URL-Routing, Cookie
  `NEXT_LOCALE`, de/en; Login/Signup, VerifyEmailBanner, Community-Header,
  LocaleSwitcher).
- **07.07.2026 (5)** — PWA/Push, Moderations-KI, Drip & Automationen
  (`PushSubscription`, `ModerationFlag`, `Lesson.dripAfterDays`,
  `AutomationStep/Delivery`, Cron `/api/cron/automations`).
- **07.07.2026 (4)** — SEO, Custom Domains, 2FA (robots/sitemap/OG-Image,
  `customDomainVerifiedAt` + DNS-Check, TOTP RFC 6238 mit `qrcode`).
- **07.07.2026 (3)** — SSE-Echtzeit-Chat, Redis-Rate-Limits, Community-Suche
  (pg_trgm + GIN).
- **07.07.2026 (2)** — Public API & Webhooks, Analytics, Referral-Programm.
- **07.07.2026** — Vitest-Suite (51 Tests), E-Mail-Verifizierung,
  In-App-Benachrichtigungen.
- **06.07.2026** — AI-Assistent Bild-Modus (`gemini-3.1-flash-image`),
  Chat/Bild-Verläufe getrennt; Logo in Header & Footer.
- **05.07.2026** — Marketing-Texte kundenfreundlich überarbeitet; Memory Bank
  neu angelegt.

</details>
