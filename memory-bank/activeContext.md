# Active Context — Aera

_Zuletzt aktualisiert: 30. Juli 2026_

## Aktueller Fokus

**Live-Streaming direkt über Aera** (Cloudflare Stream Live): Creators können ohne
Drittsoftware (OBS optional) direkt im Browser per **WebRTC/WHIP** live gehen.
Neueste Migrationen `20260729100000_live_source` + `20260729120000_live_ingest`
(„ingest"-Spalte als eigene Migration nachgezogen). Customer-Code von Cloudflare
Stream wird auch als Adresse akzeptiert. Doku: `docs/live-streaming-setup.md`.

## Letzte Änderungen (30. Juli 2026)

### Live-Chat: Nachrichten kommen wieder zuverlässig live an
- Der Polling-Fallback sprang nur bei hartem SSE-Fehler an. Blieb der Stream
  offen, aber stumm (Keepalive-Pings ja, Events nein — z. B. mehrere Instanzen
  ohne Redis oder puffernde Proxies), gab es weder Fehler noch Fallback:
  Chat stumm bis zum Reload.
- Fix in `live-room.tsx` + `browser-studio.tsx`: **deduplizierter Sync läuft
  jetzt immer** (alle 4 s, SSE bleibt der sofortige Pfad), eigene Nachricht
  sofort aus der POST-Antwort eingeblendet, Zeitstempel-Cursor als Ref statt
  Stale Closure. In `chat-thread.tsx` pausiert das Polling bei offenem Stream
  nicht mehr dauerhaft (periodischer Abgleich jeden 5. Tick).

### Live-Karten: neues Design + „eine Bühne" bei laufender Sendung
- `live-session-card.tsx` neu: **LIVE** als dunkle Bühne (rot pinging,
  Glows, CTA „Jetzt ansehen"), **geplant** hell mit Countdown,
  **Aufzeichnung** ruhig mit Wiedergabe-Verweis; `featured`-Prop als große
  Hero-Variante.
- Läuft eine Sendung, steht sie **allein** im Rampenlicht: Space-Seite
  (`/c/[slug]/s/[spaceSlug]`) und Community-Startseite (`/c/[slug]`) zeigen
  dann nur die eine Hero-Karte (Startseite mit pinging Punkt in der
  Überschrift); geplante Streams rücken in die Scroll-Reihe, sobald nichts
  mehr live ist. Live-Übersicht (`/c/[slug]/live`) bleibt gruppiert.
- i18n: `liveWatchNow`/`liveWatchReplay` in allen 17 Vollkatalogen.
  tsc 0 Fehler, ESLint sauber, 508/508 Tests grün.

## Letzte Änderungen (29. Juli 2026)

### Live-Studio: Vollbild-Popover für Browser-Sendungen (Stream + Chat)
- Neues `components/dashboard/browser-studio.tsx`: Bei Stream-Quelle „Im Browser"
  öffnet sich aus dem Session-Blatt (Studio-Karte) bzw. direkt aus der
  Session-Liste („Live gehen"/„Sendung öffnen") ein **Vollbild-Studio**
  (Portal nach `body`, `z-[70]` über dem Sheet, Slide-up). Links dunkle Bühne
  mit Video-Vorschau + Vollbild + On-Air-Timer, darunter die komplette
  Steuerung (Bildquelle, Kamera-/Mikro-Wahl, Mute, Live/Ende); rechts der
  **Zuschauer-Chat** derselben Session (SSE + Polling-Fallback wie der
  Community-Live-Room, Composer für den Creator); mobil wird der Chat als
  Bottom-Sheet eingeblendet.
- WHIP-Logik 1:1 aus `browser-broadcaster.tsx` übernommen (Datei gelöscht,
  wurde nur dort genutzt). Schließen-Guard per `confirm` bei laufender
  Sendung; Hinweis-Overlay, wenn die Sendung ohne lokale Vorschau läuft
  (z. B. nach Reload). Escape schließt dank `isTopmostModal` nur das Studio.
- Chat-API: `GET /api/c/[slug]/live/[sessionId]` ohne `after` liefert jetzt die
  **letzten** Nachrichten (`fetchRecentLiveMessages` gab es schon); mit
  `after` unverändert inkrementell.
- i18n: 12 neue `dashboard.live`-Keys (studioTitle/-Open/-CardDesc, studioChat*,
  studioFullscreen, studioCloseConfirm, studioNoPreview) in allen 17
  Vollkatalogen. tsc 0 Fehler, ESLint sauber, 508/508 Tests grün.

### Live über Aera streamen (WebRTC/WHIP + Cloudflare Stream)
- Der Space-Typ **LIVE** (bestehend, eigene Seite `app/c/[slug]/live/page.tsx`)
  bekommt eine echte **Stream-Quelle**: Migrationen `20260729100000_live_source`
  + `20260729120000_live_ingest` (Ingest-Art je Session).
- `lib/cloudflare-stream.ts`: Live-Input-Verwaltung über die Cloudflare-Stream-API
  (Erzeugung, WHIP-URL, Playback). Env: `CLOUDFLARE_STREAM_*` in `lib/env.ts` +
  `lib/env-validation.ts` ergänzt.
- `app/actions/live.ts`: Live-Session-Aktionen (anlegen, starten, beenden) stark
  erweitert (~240 Zeilen Diff). `live-manager.tsx` im Dashboard massiv ausgebaut
  (~480 Zeilen Diff): Plattform-Auswahl mit Original-Logos, umfangreicher
  Session-Popover, Tier-Auswahl statt Freitext beim Zugriffsschlüssel, Info-Button
  mit Plattform-Tooltip, Customer-Code als Adresse akzeptiert.
- „Live gehen" direkt im Browser (WebRTC/WHIP), ohne OBS.
- Community-Seite: Live-Sektion als 2er-Slider, gleiche Kartenhöhen, Anbieterfarben,
  Countdown bis zum Start, Plattform-Logos auf den Session-Karten.
- Dynamischer Live-Room: Player/Chat in der Größe verstellbar (`live-room.tsx`).
- CSP: Streaming-Player-Domains in `frame-src` freigegeben; Chaturbate über
  offizielles cbxyz-Embed-Endpoint eingebettet.

## Letzte Änderungen (28. Juli 2026)

### Cloudflare-Stream-Live-Basis + Badges + Spaces-Übersicht
- „Live über Aera streamen" (Commit `536f8df`): `lib/cloudflare-stream.ts`,
  Live-Manager-Ausbau, Community-Live-Seite — Grundlage für den 29.07.-Ausbau.
- **Badges**: handgezeichnete Plaketten, mehr Vergabe-Bedingungen, Badge-Vergabe
  per Knopf in der Mitgliederliste; Gamification-Test fragt Auszeichnungen vorab ab.
- **Spaces-Übersicht**: Raster-/Listenansicht umschaltbar, Space-Typen alphabetisch
  sortiert, Space-Symbole aus einer einzigen Quelle; Bilder im Feed anklickbar.

## Letzte Änderungen (27. Juli 2026)

### Neuer Space-Typ MUSIC + Stories + Feed/Blog/Kommentar-Ausbau
- **MUSIC**: Musik verkaufen — Titel mit Cover und Player (Audio in `videoUrl`,
  Cover in `imageUrl`, analog Podcast). Berechtigungsschlüssel + Suchindex
  (Migration `20260727200000_space_type_music`). Übersetzungen nachgezogen.
- **Stories**: „dauerhaft bleiben" als Voreinstellung (`20260727180000_story_permanent`).
- **Feed**: mehrere Bilder je Beitrag (`20260727120000_post_images`), ein Feld für
  Bild+Video, gesperrte Beiträge wie im Blog (Titelbild verwischt), Beiträge überall
  gleich breit, „weitere Beiträge" unter den Kommentaren, Feed-Space auf der
  Community-Startseite als Lesefläche, Composer-Reiter „Inhalt/Zugriff".
- **Kommentare**: Antworten auf Kommentare, Gefällt-mir + Emoji-Auswahl (auch im
  Forum bei Kommentaren).
- **Blog/Community-Karten**: weicherer Hover-Schatten, Community-Karten immer gleich
  hoch, wählbare Kopfzeile (Mosaik höher, eigene Bilder), Upload-Anzeige unten rechts.
- **i18n-Test**: Platzhalter-Erkennung korrigiert — 26 kaputte Übersetzungen gefixt.

## Letzte Änderungen (25.–26. Juli 2026)

### Support-Tickets, SEO, Discover-Suche, Blog-Monetarisierung
- **Support-Ticket-System** für Besucher, Mitglieder und Team
  (`20260725210000_support_tickets` + `…_locale`), mit E-Mail-Benachrichtigung.
- **SEO-Einstellungen** für Plattform und Communities (`20260725200000_seo_settings`);
  Social-Bild per Upload statt URL; Admin kann Paket einer Community setzen.
- **Discover**: plattformweite Live-Suche unter `/home/search`; Marketing-
  Vergleichsbereich auf der Startseite; Dashboard-Kopfsuche als Icon mit Live-Suche.
- **Blog**: Beiträge monetarisieren, Umfragen, Titelplatte; „Ähnliche/Beliebte
  Posts" unter dem Artikel; geplante Beiträge mit Creator-Zeitzone und
  Zustandsanzeige; „Ähnliche/Neue"-Reihen unter den Kommentaren; Mobile „…"-Menü
  als Blatt, zwei Reihen als Slider; Mitglieder-Beitragskarten behalten Titelbild
  (Preis auf der Plakette).
- **Post-Sichtbarkeit**: Migration `20260726100000_post_visibility`.
- **UI**: plattformweite Session- und Tenant-Proxy-Routing-Fixes; Karten-Hover
  ohne Lift; Tab-Menüs/Kacheln in Aktionsfarbe; Branding-Farbeingabe erkennt
  jeden Hex-Code; Avatar in Onboarding-Vorschau quadratisch.

## Letzte Änderungen (23.–24. Juli 2026)

### Plan-Gating, Onboarding-Katalog, 404, Proxy-Fixes
- **Creator-Plan-Gating + Promo-Codes** (`20260724100000_creator_plan_gating_promo_codes`,
  `…_source_manual`): Space-Type-Picker, vollständiger Space-Katalog im Onboarding
  mit Plan-Reihenfolge.
- **404-Seite** mit rotierenden Vollbild-Hintergründen; statische `public/`-Assets
  auf Subdomains nicht umschreiben; `admin:status`-Diagnoseskript.
- **Deps**: next 16.2.11 + Overrides (find-my-way, sharp) gegen npm-audit-Findings;
  Railway-Newsletter-Build-Fix (Standalone-Route an neue SegmentData).

## Letzte Änderungen (21.–22. Juli 2026)

### Kalender, Tips, Live-Embeds, Newsletter-Ausbau, rounded-xl-UI
- **Kalender-Space** (CALENDAR) komplett — Termine per Popover erstellen.
- **Tips** (TIPS): Vollbild-Popover, CHF-Beträge, funktionierender Trinkgeld-Fluss;
  Hydration-Fix mit expliziter Locale.
- **Live-Serie**: umfangreicher Session-Popover mit Plattform-Auswahl (Original-
  Logos), Tier-Auswahl beim Zugriffsschlüssel, Info-Button mit Plattform-Tooltip,
  CSP-`frame-src` für Streaming-Player, dynamischer Live-Room (Player/Chat
  größenverstellbar), Countdown bis zum Start, Startseiten-Sektion als 2er-Slider.
- **Newsletter**: Text/HTML-Umschalter mit exakter HTML-Vorschau
  (`20260723080000_campaign_body_format`), umfangreicher Kampagnen-Popover,
  ausgebauter Segmente-Tab; Env-Hinweise nur noch für Plattform-Admins.
- **UI-Vereinheitlichung**: `rounded-xl` statt Pill-Form für Buttons/Suchfelder/
  Chips (Konto, Dashboard, Kategorie-Chips, Mediensuche); Join-Seite mit Signup
  und Mitgliedschaften nebeneinander, Tier-Karten hochkant.

## Letzte Änderungen (19.–20. Juli 2026)

### Produktions-Härtung, Rich-Editor, CHF-Währung, Roadmap Punkt 4
- **Sichere Direkt-Uploads** (`20260719130000_secure_direct_uploads`):
  Browser → SHA-256 streamend, Tenant-Kontingent atomar reserviert, 15-min
  signierte URL direkt in privaten S3-Bucket; erst nach Größen-/Checksum-/
  Magic-Byte- und **ClamAV**-Prüfung sichtbares `StorageObject`. Abgebrochene
  Uploads räumt der `uploads`-Cron auf. `lib/client-upload.ts`, `lib/malware-scan.ts`.
- **Secret-Verschlüsselung**: AES-256-GCM-Keyring `AERA_DATA_ENCRYPTION_KEYS`
  (Rotation via `npm run security:encrypt-secrets`).
- **RLS-Härtung**: `…_tenant_subdomain`, `…_rls_least_privilege`,
  `…_rls_authorization_boundary`, `…_lifecycle_rls`.
- **Cron-Monitoring** (`20260719160000_cron_job_monitoring`): persistente
  `CronJobHeartbeat`s, `/api/cron/status` (503 bei überfälligen Jobs), eigener
  Railway-Cron-Service (`railway.cron.toml`), Backup-Service (`railway.backup.toml`),
  `db:backup` (verschlüsselte Offsite-Dumps), `db:restore-drill`.
- **Rich-Text-Editor**: Slash-(/)-Menü, Divider, Emoji-Picker, In-Browser-
  Videoaufnahme, GIF-Picker (Tenor/Giphy), Dateianhänge + `<hr>`; Forum-„Thema
  erstellen" als Dokument-Editor mit Format-Rendering; Umfragen an Forum-Themen;
  Composer: Titelbild mit Fokuspunkt-Crop + Zoom, Per-Post-Einstellungen.
- **Plattformweite Währung** (Default **CHF**) für Billing/Anzeige/Verkauf
  (`lib/currency.ts`); Creator-Plan-Slider mit zwei Karten; keine hartcodierten
  EUR-Anzeigen mehr.
- **Lifecycle/Recht (20.07., Roadmap Punkt 4)**: Newsletter-Opt-in mit
  One-Click-Unsubscribe + Suppression (`20260720100000_newsletter_consent_suppression`),
  Streaming-Exporte + Lösch-Lifecycle (`…_data_lifecycle_exports`), versionierte
  Rechts-Nachweise (`…_legal_acceptance_evidence`), Accessibility-Basis,
  Playwright-CI mit 5 Flows.
- **Railway-Deployment-Fixes** (Serie): Web-/Cron-Deploys, frische DB-Deploys,
  progressive Env-Validierung (`lib/env-validation.ts`), Cron-Target-Validierung.
- **Plattform-Admin**: persistente DB-Rolle + verifizierte E-Mail + TOTP;
  `admin:grant/revoke` mit Session-Widerruf und Audit.
- **Apple IAP Price Points**: Merge; `lib/apple-iap.ts`/`apple-products.ts`,
  `npm run db:snap-prices`.
- **Forum-Polls/Post-Settings/Post-Cover**: Migrationen `…_forum_polls`,
  `…_post_settings`, `…_post_cover`.

## Frühere Änderungen (Archiv, 5.–12. Juli 2026)

Vollständig im Meilenstein-Log in `progress.md`. Kurzfassung:
- **12.07.**: AI-Assistent `/media`-Slash-Command + multimodaler Chat;
  Dashboard-Button-Konsistenz; Finale-Video-Hintergrund.
- **11.07.**: Bewegter Hero-Hintergrund (FFmpeg-WebP-Frames); Startseiten-Kapitel
  c5–c7; Creator Media-Bibliothek (`/dashboard/[slug]/media`, `MediaFolder`).
- **10.07.**: i18n-Migration der GESAMTEN App abgeschlossen (17 Vollkataloge,
  19 Locales); Launch-Security-Hardening (fail-closed Connect-Checkouts, Disputes,
  SSRF-Schutz Webhooks); ausfallsicherer Newsletter-Versand (Empfänger-Queue);
  Rechtstexte-Audit (CH-Betreiber); Rechtsseiten /impressum /agb /datenschutz
  /widerruf.
- **06.–09.07.**: AI-Assistent Bild-Modus (`gemini-3.1-flash-image`), getrennte
  Chat/Bild-Verläufe; PWA/Push, Moderations-KI, Drip + Automationen; SEO-Basis,
  Custom-Domain-Verifizierung, TOTP-2FA; SSE-Echtzeit-Chat, Redis-Rate-Limits,
  Community-Suche; Public API + Webhooks, Analytics, Referrals; Vitest-Suite,
  E-Mail-Verifizierung, In-App-Benachrichtigungen.

## Offene Punkte / Entscheidungen

- **Brand-Begriff „Spaces":** In Fließtexten „Bereiche"; Hero/Marquee der
  Startseite nutzt weiterhin „Space" als Design-Element → Vereinheitlichung offen.
- `README.md` hinkt teilweise hinterher (nennt „33 Tabellen"/„441 Tests",
  `middleware.ts`; tatsächlich: 84 Modelle, 508 Tests, `proxy.ts`).
- Offene Rechtsfragen aus dem 10.07.-Audit (Anwalt!): EU-Vertreter Art. 27 DSGVO,
  DE-USt-Registrierung/OSS, AVV-Muster für Creator.
- `Tenant.locale` als Community-Default (Idee, host-basierte Auflösung).

## Nächste sinnvolle Schritte

1. Live-Streaming-End-to-End-Test mit echtem Cloudflare-Account (WHIP-Ingest
   + Playback auf Subdomain).
2. „Space" in Hero/Marquee zu „Bereiche" vereinheitlichen (auf Wunsch).
3. README auf aktuellen Stand bringen (Tabellen-/Testzahlen, proxy.ts).
4. `progress.md` bei weiteren Änderungen aktuell halten.
