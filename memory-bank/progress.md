# Progress — Aera

_Zuletzt aktualisiert: 20. Juli 2026_

## Was funktioniert (implementiert)

Laut Projekt-Status ist Aera eine **voll funktionsfähige** Anwendung, kein Prototyp.

### Kernplattform
- ✅ Multi-Tenancy: Application-Layer-Scoping pro Tenant + RLS (Defense-in-Depth).
- ✅ Auth: Signup/Login, E-Mail/Passwort, Session-Cookies, Passwort-Reset (`/forgot`,
  `/reset/[token]`), Einladungen (`/invite/[token]`).
- ✅ Onboarding: Community anlegen unter `/start`.
- ✅ Tenant-Auflösung: Pfad `/c/[slug]`, Subdomain via `proxy.ts`, Custom-Domain-Feld
  vorbereitet.

### Community & Inhalte
- ✅ 14 Space-Typen: Feed, Forum, Kurs, Shop, Newsletter, Events, Blog, Wissen,
  Galerie, Videos, Chat, Podcast, Links, Werbung (Ads).
- ✅ Beiträge (Text/Bild/Video, HTML-Body), Kommentare, Reaktionen.
- ✅ Ankündigungen/Banner pro Space (`space.settings`).
- ✅ Sichtbarkeit je Space: öffentlich / Mitglieder / bezahlt.
- ✅ Bibliothek, Mitglieder-Verzeichnis, Leaderboard, Community-Startseite.

### Monetarisierung
- ✅ Mitgliedschaften (Tiers): kostenlos & bezahlt, monatlich/jährlich/einmalig.
- ✅ Digitale/physische Produkte, Bundles, Course-Access, Tier-Grant.
- ✅ Zentrale Entitlements (TIER/PURCHASE/MANUAL/ROLE).
- ✅ Stripe Checkout + Connect inkl. Plattformgebühr; Webhook grantet Zugriff.
- ✅ Auszahlungen (`/dashboard/[slug]/payouts`).

### Weitere Bereiche
- ✅ Kurse mit Lektionen & Fortschritt pro Mitglied; Events mit RSVP.
- ✅ Newsletter: Kampagnen + Segmente (Tier/Aktivität), Versand via Resend,
  Zustell-/Öffnungs-/Klick-Events.
- ✅ Chat: Direktnachrichten (DMs) + Gruppen-Chats; Live-Sitzungen.
- ✅ Mediathek: Galerie, Videos, Podcast (Player), Media-Packages.
- ✅ Creator Media-Bibliothek: `/dashboard/[slug]/media` — alle Tenant-Uploads
  (`StorageObject`), Ordner (`MediaFolder`), DnD, Umbennen/Löschen/Bearbeiten.
- ✅ Gamification: Punkte-Regeln pro Trigger, Level, Badges, Streaks, Leaderboard.
- ✅ KI: Assistent im Dashboard (mit Credits/Plänen) + Empfehlungen; tenant-isoliert;
  Keyword- oder Embedding-Modell (mit OpenAI-Key).
- ✅ KI-Bildgenerierung: Assistent-Modus „Bild" (Switch neben Credits) mit
  `gemini-3.1-flash-image`, Referenzbild-Upload (bis 4), Speichern der Ergebnisse,
  Credit-Abrechnung (kind `image_generation`).
- ✅ Getrennte Verläufe: `AssistantConversation.kind` (CHAT/IMAGE); Bild-Verläufe
  werden persistiert; Sidebar zeigt je Tab die passenden Chats/Bilder.
- ✅ Mitgliederverwaltung: Rollen (Owner/Admin/Moderator/Member), Status
  (Active/Pending/Banned), Moderation.
- ✅ Branding & Layout-Editor, Live-Preview für Staff.
- ✅ Datenexport (JSON) pro Community.
- ✅ Hilfe-Center (Help-Categories/Articles), Plattform-Admin (`/admin`), Audit-Log.

### Verifikation (laut README)
- ✅ TypeScript: 0 Fehler.
- ✅ `next build`: erfolgreich.
- ✅ DB-Migrationen angewendet auf Railway Postgres.

## Was noch offen / zu prüfen ist

- ✅ **i18n VOLLSTÄNDIG**: Kundenseitig, komplettes Creator-Dashboard UND
  Plattform-Admin (`admin.ts` + `app/admin/*` + `components/admin/*`) sind in
  allen 17 Vollkatalogen übersetzt. Die i18n-Migration der Anwendung ist damit
  abgeschlossen.
- ⏳ `formatPrice` (lib/utils.ts) formatiert weiterhin fest de-DE — für echte
  Lokalisierung der Preisdarstellung noch auf locale umstellen.
- ⏳ „Space" vs. „Bereiche": Sprachvereinheitlichung in Hero/Marquee der Startseite
  noch offen (Fließtexte bereits umgestellt).
- ⏳ Custom-Domain-Anbindung ist am Datenmodell vorbereitet, End-to-End-Flow prüfen.

## Bekannte Hinweise / Fallstricke

- RLS wird von Superuser/Table-Owner umgangen → Prod über `aera_app`-Rolle verbinden.
- Lokal: öffentliche Railway-Proxy-URL; auf Railway: interne URL verwenden.
- Ohne Keys laufen Käufe im Dev als „bezahlt", Newsletter werden nur protokolliert,
  KI arbeitet keyword-basiert.

## Meilenstein-Log

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
  427 Vitest- und 5 Playwright-Tests, TypeScript, ESLint und Production-Build
  grün; 63/63 Railway-Migrationen und 71 RLS-Policies verifiziert.

- **11.07.2026 (2)** — Bewegter Hero-Hintergrund: `videos/{1,2,3}.mp4` mit
  FFmpeg zu WebP-Frame-Sequenzen extrahiert (fps=12, 120 Frames/Clip,
  `public/hero/<n>/`; PNG→cwebp, da ffmpeg-Build ohne libwebp). Neue
  Client-Komponente `hero-frame-background.tsx` spielt die Frames ab und
  wechselt automatisch per Cross-Fade zum nächsten Clip (Endlosschleife,
  prefers-reduced-motion → Standbild); Manifest `hero-clips.ts`;
  Reproduktions-Skript `scripts/hero-frames.sh`. In Hero-Section eingebunden
  (dunkler Verlauf für Lesbarkeit). tsc + Lint grün.

- **11.07.2026** — Startseiten-Kapitel („Plattformen leihen dir Reichweite …")
  von 6 auf 7 Kapitel erweitert, um die neuen Funktionen abzubilden: neues
  Kapitel **c5 „Studio, Mediaspeicher und KI"** (Image Studio: Bilder mit KI
  erzeugen/bearbeiten/freistellen/verbessern/skalieren; Mediaspeicher: alle
  Uploads in Ordnern; KI-Assistent). Gamification wurde als **c6 „Motivation,
  die aktiv hält"** geschärft (KI-Assistent nach c5 verschoben,
  Empfehlungen behalten), Marke als **c7** ans Ende. `CHAPTER_IDS` in
  `app/(marketing)/page.tsx` ergänzt; alle 17 Vollkataloge übersetzt;
  en-GB-Override auf c7 verschoben. i18n-Tests (9/9) + tsc grün.

- **10.07.2026 (16)** — Kritische Launch-Härtung (Migration
  `20260711050000_launch_security_hardening`, auf Railway deployed): Bezahlte
  Marketplace-Checkouts sind fail-closed und erfordern ein vollständig
  aktiviertes Stripe-Connect-Konto (`charges_enabled`, `payouts_enabled`,
  `details_submitted`). Stripe-v19-Invoices werden über
  `parent.subscription_details.subscription` ausgewertet; `past_due` wird
  vollständig gemappt und bezahlter Zugriff bis zur Erholung suspendiert.
  `charge.dispute.created/closed` entzieht Bestell-, Credit-, Punkte- und
  Referral-Vorteile idempotent; gewonnene Disputes werden für eine bewusste
  manuelle Wiederfreigabe auditiert. Ausgehende Webhooks blockieren private,
  Loopback-, Link-Local-, Metadata- und nicht routbare IPs nach DNS-Auflösung,
  prüfen erneut vor jedem Versuch und lehnen Redirects ab. Tenant-Prisma-
  Operationen wechseln in einer interaktiven Transaktion zu `aera_app`; ein
  Railway-Smoke-Test beweist echte RLS-Isolation. Plattform-Audits nutzen die
  eng begrenzte Funktion `aera_write_audit` und Fehler werden nicht mehr still
  verschluckt. AutomationDelivery besitzt jetzt einen User-FK; Enqueue filtert
  bereits vorhandene Zustellungen und sortiert nach `joinedAt ASC`, sodass
  neue Mitglieder nicht verhungern. 204 Tests, TypeScript und DB-Smokes grün;
  40/40 Migrationen angewendet.

- **10.07.2026 (15)** — Verbliebene i18n-Migration abgeschlossen:
  Token-Seiten (Einladung, Passwort-Reset, E-Mail-Verifizierung), deren
  Metadaten, Community-Onboarding, globale/Marketing-Metadaten und PWA-Manifest
  sind katalogbasiert. Transaktionale Reset-/Invite-/Verify-E-Mails sowie
  Newsletter-Footer verwenden die aktive Sprache; der HTML-Renderer enthält
  keine fest deutsche Systemzeile mehr. Sichtbare Dashboard-Uploads, Medien-
  Dialoge, Rails, Chat-Sichtbarkeit und Upload-API-Fehler sind ebenfalls
  migriert. Deutsch und Englisch sind vollständig; weitere Sprachen erben neue
  Resttexte über den bestehenden englischen Fallback. Rechtstexte bleiben
  bewusst deutsch, weil Deutsch die festgelegte Vertragssprache ist.

- **10.07.2026 (14)** — Newsletter-Versand ausfallsicher gemacht (Migration
  `20260711040000_reliable_newsletter_delivery`, auf Railway deployed): Jede
  Kampagne wird vor dem ersten Provider-Aufruf vollständig als unveränderliche
  Empfänger-Queue (`NewsletterDelivery`) in Postgres gespeichert. Zustellungen
  nutzen exklusive 5-Minuten-Leases, Resend-Idempotency-Keys, maximal fünf
  Versuche mit Backoff und deduplizierte SENT/FAILED-Events. Kampagnen bleiben
  während offener Zustellungen auf SENDING und werden erst nach Abschluss aller
  Empfänger finalisiert; Bearbeiten/Löschen ist währenddessen gesperrt.
  Neue minutenbasierte Cron-Route `/api/cron/newsletters`, zusätzlich Fallback
  über `/api/cron/automations`. RLS auf 51 Tenant-Tabellen erweitert und
  Railway-Claim-Smoke-Test ergänzt. 180 Tests, TypeScript und Production-Build
  grün; 39/39 Migrationen angewendet.

- **10.07.2026 (13)** — Rechtstexte-Audit (Schweizer Betreiber, Bülach ZH):
  Impressum: Überschrift jetzt Art. 3 Abs. 1 lit. s UWG (CH) + § 5 DDG
  (DE); UID (CH) + USt-IdNr. (EU) statt nur § 27a UStG; MStV nur noch als
  DE-Zusatz. AGB: §2 um KI-Klausel ergänzt (Assistent, Empfehlungen,
  Auto-Vorprüfung; keine Auto-Löschung, Mensch entscheidet; Ausgaben
  prüfen); §10 ProdHaftG → „zwingende gesetzliche Haftungsvorschriften";
  §13 Rechtswahl → Schweizer Recht mit EU/EWR-Verbraucher-Carve-out.
  Datenschutz: revDSG-Absatz in §2 (DSGVO gilt via Art. 3 Abs. 2 für
  EU-Nutzer); §3 ergänzt um 2FA-Geheimnis, E-Mail-Bestätigungsstatus und
  Referral-Zuordnung; §6 ergänzt um KI-/Heuristik-Auto-Moderation von
  Beiträgen/Kommentaren (ModerationFlag, keine automatisierte
  Entscheidung i. S. v. Art. 22); §7 um Audit-Logs; §10 Aufbewahrung um
  Art. 958f OR; §11 um revDSG + EDÖB. Widerruf: Geltungsbereich
  klargestellt (EU/EWR-Verbraucher zwingend, freiwillig für alle — CH
  kennt kein gesetzliches Widerrufsrecht). Weiter offen (Anwalt!):
  evtl. EU-Vertreter nach Art. 27 DSGVO, DE-USt-Registrierung/OSS,
  AVV-Muster für Creator (Art. 28). credits.test.ts + prisma-mock
  parallel extern auf Reserve/Settle via $queryRaw umgestellt —
  154 Tests grün.
- **10.07.2026 (12)** — Rechtsseiten + Footer-Spalte „Aera.so":
  Neue Seiten /impressum, /agb, /datenschutz, /widerruf (LegalShell-
  Komponente im Marketing-Look). Inhalte sind deutsche VORLAGEN mit
  [Platzhaltern] (Name/Adresse/USt-ID) — vor Launch ersetzen und
  juristisch prüfen lassen; bewusst NICHT über i18n lokalisiert
  (Vertragssprache). AGB decken SaaS-Abos, Plattformgebühr, Stripe
  Connect und das Creator-Mitglied-Vertragsmodell ab; Datenschutz nennt
  Stripe/Resend/Gemini/Railway, nur technisch notwendige Cookies.
  Footer: vierte Spalte „Aera.so" (Brand, unübersetzt) mit vier
  Link-Labels in allen 17 Vollkatalogen (footerImprint/Terms/Privacy/
  Withdrawal). Sitemap um die vier Seiten ergänzt.
- **10.07.2026 (11)** — i18n-Abschluss: Plattform-Admin. Neuer Top-Level-
  Namespace `admin` (nav/pagination/overview/communities/users/media/posts/
  orders/help/audit) + 14 neue `errors`-Keys — alle 17 Kataloge. Migriert:
  admin.ts (tErr), admin layout/overview/audit/posts-Seiten, admin-nav,
  pagination (async), communities-/users-/media-/posts-/orders-/help-manager.
  Kategorie-Labels aus `categories`-Namespace; statusMeta/visibilityMeta in
  Cls+Key-Maps aufgeteilt; t.rich `<code>{slug}</code>`; nf/formatDate
  locale-abhängig; Map-Var-Kollisionen (`t`→`tenant`/`tn`) behoben. Damit ist
  die i18n-Migration der GESAMTEN Anwendung abgeschlossen. tsc + Tests grün.
- **10.07.2026 (10)** — Dashboard-i18n Teil 7: AI-Assistent-Workspace. Neuer
  Namespace `dashboard.assistant` (+`suggestions`/`imageSuggestions`) — alle 17
  Kataloge. Migriert: `assistant-workspace.tsx` (Sidebar, Chat-/Bild-
  Leerzustände, Vorschläge als `{icon,key}`+t, Credits-Button, ModeSwitch,
  Eingaben/Hinweise, Lösch-Dialog, ConversationRow/ImageMessageRow/
  GeneratingRow, Session-/API-Fehler, Out-of-Credits). `nf`/`relTime`
  locale-abhängig; Unterkomponenten via `t: AssistantT`-Prop. Damit ist der
  gesamte Creator-Dashboard-Bereich fertig. OFFEN: nur Plattform-Admin.
- **10.07.2026 (9)** — Dashboard-i18n Teil 6: Space-Content Batch 6 (Abschluss).
  Neue Namespaces `announcements`, `spaceContent` (+typeLabels/createLabels/
  managedLabels) — alle 17 Kataloge. Migriert: announcements-manager,
  space-content-manager (deutsche Type-/Create-Maps durch i18n ersetzt,
  useCreateLabel-Helper, formatDate locale-abhängig). Der komplette Space-
  Content-Block ist fertig. OFFEN: AI-Assistent-Workspace, Plattform-Admin.
- **10.07.2026 (8)** — Dashboard-i18n Teil 6: Space-Content Batch 5. Neue
  Namespaces `chat`, `newsletter` (+`status`) — alle 17 Kataloge. Migriert:
  chat-space-manager (relTime/msgTime/slowLabel jetzt locale-/t-basiert,
  CHAT_POLICY_LABELS aus lib ersetzt), newsletter-manager (statusMeta→statusCls
  + i18n, formatDateTime mit useLocale, Map-Var `t`→`tier`). OFFEN:
  announcements, space-content-manager.
- **10.07.2026 (7)** — Dashboard-i18n Teil 6: Space-Content Batch 4. Neue
  Namespaces `ads`, `forumMod` — alle 17 Kataloge. Migriert: ads-manager
  (Banner-Rotation, t.rich Layout-Link), forum-moderation-manager (Threads/
  Kommentare, t.rich Autor-Zeilen, formatDate mit useLocale). Map-Var-Kollision
  in ads (`t`→`mt`) behoben. OFFEN: chat, newsletter, announcements,
  space-content-manager.
- **10.07.2026 (6)** — Dashboard-i18n Teil 6: Space-Content Batch 3. Neue
  Namespaces `courses`, `gallery` — alle 17 Kataloge. Migriert: courses-manager
  (inkl. Lektionen/Drip), gallery-manager (Medienpakete). ICU-Plurale.
  OFFEN: ads, chat, newsletter, announcements, forum-moderation,
  space-content-manager.
- **10.07.2026 (5)** — Dashboard-i18n Teil 6: Space-Content Batch 2. Neue
  Namespaces `blog`, `knowledge` + geteiltes `sortLabels` (NEWEST/OLDEST/AZ/ZA)
  — alle 17 Kataloge. Migriert: blog-manager, knowledge-manager (Label-Maps aus
  lib/space-settings jetzt via i18n; formatDate mit useLocale). OFFEN: courses,
  gallery, ads, chat, newsletter, announcements, forum-moderation,
  space-content-manager.
- **10.07.2026 (4)** — Dashboard-i18n Teil 6: Space-Content Batch 1. Neue
  Namespaces `rte` (geteilter Rich-Text-Editor), `links`, `events` — alle 17
  Kataloge. Migriert: rich-text-editor, links-manager, events-manager.
  OFFEN in diesem Block: blog, courses, gallery, knowledge, ads, chat,
  newsletter, announcements, forum-moderation, space-content-manager.
- **10.07.2026 (3)** — Dashboard-i18n Teil 5: Einstellungen. Neue Namespaces
  `settings` (+`stripeTest`), `branding`, `domain`, `danger`, `developers`
  (+`events`), `export` (+`datasets`), `moderation` (+`categories`), `layout`
  (+`audiences`/`sections`/`sectionGroups`/`navTypes`) — alle 17 Kataloge.
  Migriert: settings-Seite + settings-panels, stripe-test + integration-test
  (Server-Testmeldungen), developers-Seite/-manager, export-Seite,
  moderation-Seite, layout-editor. `lib/layout.ts` bleibt Icon-/Typ-Quelle;
  Editor-Labels aus i18n. Webhook-Events via EVENT_KEYS auf sichere Keys.
  tsc + i18n-Tests grün.
- **10.07.2026 (2)** — Dashboard-i18n Teil 4: Wachstum. `dashboard`-Namespace
  um `analytics`, `gamification` (+`.triggers`/`.criteria`), `referrals`,
  `automations` erweitert (alle 17 Kataloge). Migriert: `analytics/page`,
  `gamification-manager`, `referral-settings`, `referrals/page`,
  `automations-manager`, `automations/page`. Server-Seiten mit
  `generateMetadata` + locale-basierten Intl-Formatierern; ICU-Plurale
  (Abos/Bestellungen/Teilnehmende/Lektionen); `t.rich` für Conversion-Zeilen,
  Cron-/Platzhalter-Hinweise (`<code>`). Template-Tokens `{{name}}`/
  `{{community}}` als Werte übergeben (kein ICU-Escaping). tsc + i18n-Tests grün.
- **10.07.2026** — Dashboard-i18n Teil 3: Monetarisierung. `dashboard`-
  Namespace um `tiers`, `products`, `payouts`, `productTypes`,
  `tierIntervals`, `orderStatus` erweitert (alle 17 Kataloge). Migriert:
  `tiers-manager`, `products-manager`, payouts-Seite (locale-Datum +
  orderStatus-Labels). ICU-Plurale für Mitglieder-/Verkaufs-/Kaufzähler.
  137 Tests + tsc grün.
- **09.07.2026 (3)** — Dashboard-i18n Teil 2: Mitglieder. `dashboard`-
  Namespace um `members` + `memberStatus` erweitert (alle 17 Kataloge);
  `members-manager` migriert (Liste, Team/Gesperrt-Tabs, Hinzufügen inkl.
  Einladungslink, Bearbeiten, eigenes Profil). Rollen werden aus
  `dashboard.roles` wiederverwendet. `settings-tabs.tsx` braucht keine
  Migration (nur Props). 137 Tests + tsc grün.
- **09.07.2026 (2)** — Dashboard-i18n Teil 1: Chrome + Spaces.
  `dashboard`-Namespace erweitert um `overview`, `topbar`, `userMenu`,
  `search`, `subscription`, `credits`, `roles`, `spaceTypes`, `visibility`,
  `spaces` — alle in ALLEN 17 Vollkatalogen. Migriert: Übersichtsseite,
  `top-header` (jetzt async Server-Comp.), `user-menu`, `search-box`,
  `my-subscription`, `credits-sheet` (locale-basierte Zahl/Datum via
  useLocale), `spaces-manager`, `space-create-overlay`, spaces-Seite.
  Zahl-/Datumsformate in Client-Komponenten nutzen jetzt useLocale().
  137 Tests + tsc grün. OFFEN: members, monetization (tiers/products/payouts),
  growth (analytics/gamification/referrals/automations), settings/layout/
  developers/export/moderation, Space-Content-Manager (blog/courses/events/
  gallery/knowledge/links/ads/chat/newsletter/announcements/forum), Assistent,
  admin.
- **09.07.2026** — i18n-Fertigstellung kundenseitig + Dashboard-Start:
  Neue Namespaces `errors` (Server-Action-Fehlermeldungen), `library`,
  `help`, `account` und `dashboard.nav` — alle in ALLEN 17 Vollkatalogen.
  Server-Actions übersetzen Fehler via `lib/action-errors.ts`
  (`getErrorTranslator`/`zodError`/`tErr`/`zodErr`); `lib/validation.ts` und
  `lib/auth.ts` liefern jetzt `errors.*`-Keys statt Klartext. Migriert:
  Bibliothek (`/c/[slug]/library`), Hilfe (`/hilfe`), Konto (`/member/account`
  + member-settings/totp-settings/push-settings) und die Dashboard-Navigation
  (`dashboard-nav`/`mobile-nav`). Vollständigkeits-Test um die neuen
  Namespaces erweitert (137 Tests grün, tsc 0 Fehler).
  OFFEN: `app/actions/admin.ts` (Plattform-Admin) sowie der Großteil des
  Creator-Dashboards (~45 Manager-Komponenten + Seiten-Bodies) — hart deutsch.
- **08.07.2026 (8)** — Space-Chrome mehrsprachig: neuer Namespace `spaces`
  (Like/Unlike, Kommentar-/Antwort-Formulare, Post-Composer, Up-/Downvote,
  Forum-Thread inkl. „Zurück zum Forum"/Login-Hinweis, komplettes
  Chat-Interface: Heute/Gestern, Empty-States, Slow-Mode/Fehler-Notices,
  Composer, Join-Footer). WICHTIG: `timeAgo`/`formatDate`/`formatDateTime`
  in lib/utils.ts haben jetzt einen locale-Parameter (Default "de" für
  unmigrierte Aufrufer); timeAgo nutzt Intl.RelativeTimeFormat. Migrierte
  Komponenten (post-card, forum-thread, chat-thread) reichen useLocale()
  durch. Alle 17 Vollkataloge + Test (spaces.* Pflicht).
- **08.07.2026 (7)** — Community-Kernseiten mehrsprachig: `community`-
  Namespace erweitert um `joinPage` (Tier-Auswahl inkl. Badges, Intervalle,
  CTAs, Signup-Karte), `members` (Rollen-Badges, „Mitglied seit" mit
  locale-Datum, Punkte), `leaderboard` (Podium/Ranking, Empty-States) und
  `invite` (Referral-Karte, nutzt common.copy/copied). Join-Seite: Map-Var
  `t`→`tier` (Shadowing). Alle 17 Vollkataloge + Vollständigkeits-Test
  (community.* jetzt Pflicht). Offen: Space-Inhalte (Feed/Forum/Kurs-Chrome,
  post-card, Composer), Bibliothek, Konto-Seite, Hilfe-Center, Dashboard.
- **08.07.2026 (6)** — Entdecken-Seite (/home) mehrsprachig: Namespaces
  `discover` (Titel, Suche, Suchergebnisse mit ICU-Pluralen inkl. few/many
  für pl/ru/uk, Sektionen, Themen-Kacheln, Banner, Chips-Pfeile, Rail-Labels)
  und `categories` (12 Themen-Labels — lib/categories.ts bleibt
  Key/Icon/Gradient-Quelle, Labels kommen aus t()). Umgestellt:
  app/home/page.tsx (inkl. SearchBar; Map-Var `t`→`tenant` wegen
  t()-Shadowing!), category-chips.tsx, community-card.tsx (Zahlformat via
  useLocale), home-rail.tsx. Vollständigkeits-Test + discover./categories.
- **08.07.2026 (5)** — Features-Seite mehrsprachig: Namespace `features`
  (Intro, 13 Sektionen s1–s13 mit Titel/Text/3 Tags, CTAs) in
  `app/(marketing)/features/page.tsx` (SECTION_IDS-Schleife, Nummern
  generiert) und allen 17 Vollkatalogen (~70 Keys/Sprache).
  Vollständigkeits-Test deckt jetzt auch features.* ab.
  Außerdem: Sprach-Popover im Marketing-Header (`language-popover.tsx`,
  runder Flaggen-Button, LOCALE_FLAGS-Emojis in i18n/locales.ts, Outside-
  Click/Escape) + runde Flaggen im Konto-LocaleSwitcher.
  → Damit ist der KOMPLETTE Marketing-Auftritt (Start, Features, Preise,
  Login/Signup/Forgot, Header/Footer) in 19 Sprachen. Offen: Hilfe-Center,
  /home (Entdecken), Community-Oberflächen, Dashboard.
- **08.07.2026 (4)** — Auth- & Preise-Seite mehrsprachig: Namespaces
  `authPages` (Login/Signup inkl. Creator-Variante, Passwort-vergessen-Seite
  + ForgotPasswordForm) und `pricing` (Intro, CTAs, Credit-Packs, Fußnote
  sowie Plan-Taglines/Features FREE–SCALE) in allen 17 Vollkatalogen.
  Hinweis: `lib/credit-plans.ts` bleibt deutsche Quelle (Dashboard nutzt sie
  weiter); die Pricing-SEITE zieht Taglines/Features aus t(). Zahlformat der
  Credit-Packs jetzt locale-abhängig (getLocale → Intl.NumberFormat).
  Vollständigkeits-Test deckt home/marketing/authPages/pricing ab.
- **08.07.2026 (3)** — Startseite KOMPLETT mehrsprachig: neuer Namespace
  `marketing` (Header-Nav, Login/CTA, Mobile-Menü inkl. Aria-Labels, Footer:
  About, Spalten, Tagline) in `marketing-header.tsx`, `mobile-nav.tsx` und
  `app/(marketing)/layout.tsx`; in allen 17 Vollkatalogen übersetzt (en-GB/
  es-419 erben). Vollständigkeits-Test deckt jetzt home.* UND marketing.* ab.
  LocaleSwitcher-Fixes: auto-rows-fr (gleich hohe Karten), min-w-0/break-words
  (kein Overflow), Sprachsektion md:col-span-2 (volle Breite).
- **08.07.2026 (2)** — i18n-Ausbau: 19 Sprachen + Startseite übersetzt:
  - `i18n/locales.ts`: 19 Locales (de, en, en-GB, da, es, es-419, fr, it, nl,
    nb, pl, pt-BR, sv, ru, uk, ja, zh-Hans, zh-Hant, ko) mit nativen Labels.
  - Fallback-Kette in `i18n/request.ts` (`localeChain`): en → Elternsprache
    (z. B. es für es-419) → Locale, per Deep-Merge. Kataloge dürfen
    unvollständig sein; fehlende Keys erscheinen auf Englisch.
  - Startseite `app/(marketing)/page.tsx` komplett auf `home.*`-Keys (~95
    Texte: Hero, 14 Marquee-Kacheln, Statement, 6 Kapitel, Umsatzwege,
    Ownership, Finale) und in ALLEN 17 Vollkatalogen übersetzt; en-GB und
    es-419 sind bewusst dünne Override-Kataloge.
  - LocaleSwitcher: Grid aller 19 Sprachen mit nativen Namen.
  - Tests erweitert: Datei↔Locale-Abgleich, Keys ⊆ en, ICU-Platzhalter-
    Gleichheit über alle Kataloge, Startseiten-Vollständigkeit,
    localeChain-Reihenfolge. Gesamt jetzt 137.
- **08.07.2026** — i18n-Grundstein (next-intl, ohne URL-Routing):
  - Infrastruktur: `next-intl`-Plugin in next.config.ts, `i18n/request.ts`
    (Locale aus Cookie `NEXT_LOCALE`, Default de, unterstützt de/en),
    `NextIntlClientProvider` + dynamisches `<html lang>` im Root-Layout,
    Kataloge `messages/de.json` + `messages/en.json`.
  - Umgestellte Oberflächen (Muster für alles Weitere): Login-/Signup-
    Formulare (inkl. 2FA-Feld), VerifyEmailBanner (t.rich), Community-Header
    (Beitreten/Suche/Glocke), Benachrichtigungs- und Suchseite.
  - Sprachumschalter im Mitgliedskonto (`LocaleSwitcher`,
    `setLocaleAction` setzt Cookie 1 Jahr).
  - Tests: Katalog-Parität (Keys + ICU-Platzhalter de↔en), normalizeLocale.
    Gesamt jetzt 132.
  - ✅ MIGRATION ABGESCHLOSSEN am 10.07.2026: Marketing, aktive Dashboard-
    Oberflächen, Server-Action-Fehlertexte und transaktionale E-Mails sind
    katalogbasiert. Neue UI-Texte weiterhin immer in DE und EN anlegen.
  - Offene Idee: `Tenant.locale` als Community-Default (Auflösung müsste
    host-basiert im Request-Config passieren).
- **07.07.2026 (5)** — PWA/Push, Moderations-KI, Drip & Automationen
  (Migration `20260707140000_push_moderation_automations`, noch NICHT deployed):
  1. **PWA + Web-Push**: `app/manifest.ts`; `public/sw.js` jetzt Push-fähig
     (bewusst weiterhin ohne fetch-Caching). `PushSubscription`-Model (global
     pro User, kein Tenant/RLS), `lib/push.ts` (web-push/VAPID, key-gated,
     räumt tote Endpoints auf), `/api/push` (POST/DELETE), `notify()` sendet
     zusätzlich Push. UI im Mitgliedskonto (nur wenn VAPID-Keys gesetzt).
     Neue Env: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
  2. **Moderations-KI**: `ModerationFlag`-Model (RLS ergänzt),
     `lib/moderation.ts` — Gemini-Klassifikation (spam/toxisch/belaestigung,
     strict JSON) mit Heuristik-Fallback (Link-Spam, Scam-Muster, Wortliste,
     Caps). Hooks in createPost/createComment (Staff ausgenommen, best
     effort, NIE Auto-Löschung). Dashboard „Moderation" (Nav „Verwalten"):
     Freigeben / Inhalt entfernen (min. MODERATOR).
  3. **Drip & Automationen**: `Lesson.dripAfterDays` — Kursseite zeigt
     gesperrte Lektionen („In N Tagen"), `completeLessonAction` erzwingt
     serverseitig, Editor-Feld im Kurs-Manager. Onboarding-Serie:
     `AutomationStep`/`AutomationDelivery` (unique stepId+userId =
     idempotent), `lib/automations.ts` (Platzhalter {{name}}/{{community}},
     nur verifizierte E-Mails, max 200/Lauf), Cron-Route
     `/api/cron/automations` (CRON_SECRET, extern stündlich aufrufen),
     Dashboard „Automationen" (Nav „Wachstum").
  Neue Dependencies: `web-push` (+types). Tests: jetzt 128 (neu: drip,
  moderation, automations).
- **07.07.2026 (4)** — SEO, Custom Domains, 2FA (Migration
  `20260707130000_domains_totp`, noch NICHT deployed):
  1. **SEO**: `app/robots.ts` (private Bereiche disallowed), `app/sitemap.ts`
     (Marketing + Tenants + PUBLIC-Spaces + deren veröffentlichte Posts,
     Kappung 500 Tenants / 200 Posts), dynamisches OG-Image pro Community
     (`app/c/[slug]/opengraph-image.tsx`, next/og, Markenfarbe + Name).
  2. **Custom Domains**: `Tenant.customDomainVerifiedAt` (Bestandsdomains
     grandfathered). `lib/domains.ts`: DNS-Check via CNAME→Root-Domain ODER
     TXT `_aera.<domain>` = `aera-verify=<tenantId>`;
     `verifyCustomDomainAction`; DomainPanel zeigt Status + DNS-Anleitung +
     „Jetzt prüfen". Domainwechsel resettet Verifizierung;
     `/api/resolve-domain` löst nur noch verifizierte Domains auf.
  3. **2FA (TOTP)**: `lib/totp.ts` (RFC 6238 ohne Fremd-Dependency, SHA-1,
     6 Stellen, ±1 Slot, timing-safe; RFC-Testvektoren grün).
     `User.totpSecret/totpEnabledAt`. Einrichtung im Mitgliedskonto
     (QR via `qrcode`-Package, Secret-Fallback, Code-Bestätigung),
     Deaktivierung nur mit gültigem Code. Login fragt bei aktivem 2FA den
     Code ab (`authenticate(email, pw, totp?)`, `AuthState.needsTotp`,
     Code-Feld im LoginForm). Rate-Limits auf Code-Versuche.
  Neue Dependency: `qrcode`. Tests: jetzt 112 (neu: totp, domains).
- **07.07.2026 (3)** — Drei Infrastruktur-Features:
  1. **Echtzeit-Chat (SSE)**: `lib/realtime.ts` (In-Process-Pub/Sub via
     EventEmitter; für Multi-Instanz auf Redis Pub/Sub umstellbar). Neue
     SSE-Route `/api/c/[slug]/chat/stream` (Zugriff wie REST-Route, Keep-Alive
     alle 25s, Max-Age 15min). Chat-POST publisht Nachrichten;
     `chat-thread.tsx` nutzt EventSource, das bisherige Polling bleibt als
     Fallback (pausiert, solange SSE verbunden). Gemeinsamer Resolver in
     `app/api/c/[slug]/chat/_resolve.ts`.
  2. **Rate-Limiting mit Redis**: `lib/rate-limit.ts` async; Redis-Backend via
     `REDIS_URL` (ioredis, INCR+PEXPIRE, fail-open bei Redis-Ausfall),
     In-Memory-Fallback ohne REDIS_URL. Alle 7 Aufrufer auf `await` umgestellt.
     `REDIS_URL` in env.ts + .env.example.
  3. **Community-Suche**: `lib/search.ts` (Beiträge, Kurse, Wissen, Events,
     Produkte; case-insensitive; Space-Sichtbarkeit/Entitlements geprüft —
     gesperrte Treffer ohne Auszug, verlinken auf /join). Seite
     `/c/[slug]/search` (GET-Form, ohne JS nutzbar), Lupe im Community-Header.
     Migration `20260707120000_search_indexes` (pg_trgm + GIN auf Post/
     KnowledgeArticle) — noch NICHT deployed.
  Tests: jetzt 96 (neu: rate-limit, realtime, search).
- **07.07.2026 (2)** — Drei Wachstums-Features (Migration
  `20260707110000_api_webhooks_referrals`, noch NICHT deployed):
  1. **Öffentliche API & Webhooks**: `ApiKey`/`WebhookEndpoint`/
     `WebhookDelivery`-Models (RLS ergänzt). Read-only REST unter `/api/v1/`
     (members, orders, subscriptions; Bearer-Key `aera_sk_…`, nur SHA-256-Hash
     gespeichert, 120 req/min, Cursor-Pagination — `lib/api-keys.ts`,
     `lib/public-api.ts`). Ausgehende Webhooks (`lib/webhooks.ts`): Events
     member.joined, order.paid, subscription.created/canceled; HMAC-Signatur
     `Aera-Signature` (t=…,v1=…, Stripe-Schema); Zustell-Log. Dashboard-Seite
     `/dashboard/[slug]/developers` (Nav „Entwickler & API").
  2. **Analytics**: `lib/analytics.ts` (MRR, Churn 30d, Umsatz 30d/gesamt,
     Mitgliederwachstum 6M, Engagement-Trends, Kurs-Abschlussraten,
     Newsletter-Performance) + Seite `/dashboard/[slug]/analytics`
     (Nav „Statistiken"). Dafür `Subscription.updatedAt` ergänzt.
  3. **Referral-Programm**: `Membership.referralCode/referredById`,
     `Tenant.referralPercent`, `ReferralConversion`-Model, Gamification-
     Trigger REFERRAL. `lib/referrals.ts` (Code-Erzeugung, ?ref=-Auflösung,
     Join-/Purchase-Conversions mit Provision; dedupe, self-referral-Schutz).
     Einladungs-Karte auf `/c/[slug]/members`, ?ref= auf der Join-Seite,
     Dashboard `/dashboard/[slug]/referrals` (Nav „Empfehlungen") inkl.
     Provisions-Einstellung. Provisions-AUSZAHLUNG erfolgt manuell durch den
     Creator (kein Stripe-Transfer).
  Tests: jetzt 81 (neu: api-keys, webhooks, referrals, analytics).
- **07.07.2026** — Drei Härtungs-Features:
  1. **Test-Suite (Vitest)**: 51 Unit-Tests für `entitlements`, `credits`,
     `credit-plans`, `gamification`, `notifications` und den Stripe-Webhook
     (Idempotenz, Paywall-Logik, Credit-Abrechnung). `npm test` / `npm run
     test:watch`; Config in `vitest.config.ts`, Prisma-Mock in
     `tests/helpers/prisma-mock.ts`.
  2. **E-Mail-Verifizierung**: `User.emailVerifiedAt` (Migration
     `20260707100000_email_verification`, Bestandskonten grandfathered).
     Versand bei Signup (`lib/verification.ts`, stateless "verify"-Token),
     Seite `/verify/[token]`, Resend-Action + Banner (`VerifyEmailBanner`
     in Home- & Community-Layout). Invite/Reset setzen Verifizierung mit.
     Newsletter gehen nur noch an verifizierte Adressen.
  3. **In-App-Benachrichtigungen**: Model `Notification` (Migration
     `20260707101000_notifications`, RLS-Tabelle ergänzt),
     `lib/notifications.ts` (notify mit Self-Skip + Dedupe), Hooks in
     `engage.ts` (Kommentar auf Beitrag, Antwort auf Kommentar, Reaktion),
     Glocke mit Unread-Badge im Community-Header, Seite
     `/c/[slug]/notifications` (Ansehen = gelesen).
  ⚠️ Migrationen sind erstellt, aber noch NICHT deployed → `npm run db:deploy
  && npm run db:rls` gegen Railway ausführen.
- **06.07.2026** — AI-Assistent um Bild-Modus erweitert (`gemini-3.1-flash-image`,
  Chat/Bild-Switch, Referenzbild-Upload, Speichern, Credit-Abrechnung); Logo in
  Header & Footer eingebunden.
- **05.07.2026** — Marketing-Texte (Startseite + Features) auf vollständige,
  kundenfreundliche Feature-Darstellung überarbeitet; Memory Bank neu angelegt.
