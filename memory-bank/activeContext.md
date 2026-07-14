# Active Context — Aera

_Zuletzt aktualisiert: 11. Juli 2026_

## Letzte Änderungen (12. Juli 2026, Teil 3)

### AI-Assistent: Slash-Command `/media` + multimodaler Chat
- Tippt der User `/` im Composer, erscheint ein Slash-Menü mit `/media`; Auswahl
  öffnet einen Media-Picker (neueste 60 Tenant-Bilder) und hängt das gewählte
  Bild als Referenz-Thumbnail über dem Eingabefeld an — in **Chat- und
  Bild-Modus**.
- Neue Route [`app/api/dashboard/media/library/route.ts`](app/api/dashboard/media/library/route.ts)
  (`GET ?slug=`, Admin-Gate, image-`StorageObject`s).
- Neue Komponente `components/dashboard/media-picker-sheet.tsx` (`PickerImage`,
  fetch on open, Grid im Dashboard-Stil).
- `assistant-workspace.tsx`: `attachments` jetzt für BEIDE Modi (Thumbnail-Leiste
  + Galerie-Button + Slash-Menü im Chat-Composer), `detectSlash`/`onComposerChange`/
  `chooseSlashMedia`, `urlToDataUrl`, `parseChatMessages`; `send()` schickt `images`
  und rendert Anhänge in `MessageRow`. Geteiltes verstecktes File-Input.
- Chat multimodal: `lib/assistant.ts` `runAssistantTurn(..., images)` persistiert
  Referenzbilder (`persistAssistantImage`, purpose `assistant-image`), speichert
  User-Message als JSON `{text, attachments}` bei Bildern, hängt `inlineData` an
  die aktuelle User-Nachricht. Route [`app/api/dashboard/assistant/route.ts`](app/api/dashboard/assistant/route.ts)
  nimmt `images[]` (max 4, ≤5 MB via base64-Länge), erlaubt leeren Text mit Bildern.
- i18n: 7 neue `dashboard.assistant`-Keys (slashMedia/-Hint, mediaPicker*) in allen
  17 Vollkatalogen. tsc OK, i18n-Tests 9/9, keine Lint-Fehler.

## Letzte Änderungen (12. Juli 2026, Teil 2)

### Dashboard-Button-Konsistenz (referrals/developers/automations)
- Ursache Lila: `referral-settings.tsx` + `developers-manager.tsx` nutzten die
  geteilte `components/ui/button.tsx` (`primary` = `bg-[var(--brand)]` = Aera-
  Violett). Im Creator-Dashboard ist `--brand` nicht pro Tenant gesetzt → Lila,
  während der Rest des Dashboards native Slate-Buttons verwendet. `cn` ist nur
  ein Join (kein tailwind-merge), daher ist ein className-Override unzuverlässig.
- Fix: In beiden Dateien die `<Button>`-Nutzungen durch den Dashboard-Standard
  ersetzt (`rounded-xl bg-slate-900 … hover:bg-slate-800 active:scale-[0.98]`,
  Copy-Button `rounded-lg … px-3 py-1.5`) und den ungenutzten Button-Import
  entfernt. Die geteilte Button-Komponente bleibt unverändert (wird in
  Community/Tenant-Kontexten mit echtem `--brand` gebraucht).
- `automations-manager.tsx`: „Schritt hinzufügen"-Button von `rounded-full` auf
  `rounded-xl` (+ inline-flex/gap) umgestellt. tsc + Lint grün.

## Letzte Änderungen (12. Juli 2026)

### Finale-Abschnitt mit Video-Hintergrund
- `videos/4.mp4` (1280×720, 24 fps, ~10 s) analog zu WebP-Frames extrahiert
  (fps=12 → 120 Frames) nach `public/finale/`.
- `HeroFrameBackground` nimmt jetzt einen `clips`-Prop (Default `HERO_CLIPS`);
  neue Manifest-Konstante `FINALE_CLIPS` (ein einzelner, sanft loopender Clip).
- Im Finale-Block „Fang klein an. Bleib unabhängig." (`app/(marketing)/page.tsx`)
  eingebunden: `relative isolate overflow-hidden`, Hintergrund `-z-10`, dazu ein
  **radiales** Overlay (Mitte dunkler) statt des vertikalen Verlaufs, damit der
  zentrierte Text lesbar bleibt. `scripts/hero-frames.sh` um Clip 4 → `finale`
  erweitert. tsc + Lint grün; Frames als `image/webp`.

## Letzte Änderungen (11. Juli 2026, Teil 2)

### Bewegter Hero-Hintergrund aus FFmpeg-Frames
- `videos/{1,2,3}.mp4` (je 1280×720, 24 fps, ~10 s) mit FFmpeg zu web-optimierten
  **WebP-Frame-Sequenzen** extrahiert (fps=12 → 120 Frames/Clip) unter
  `public/hero/<n>/frame_%04d.webp`. Hinweis: Der Homebrew-ffmpeg-Build hat
  keinen `libwebp`-Encoder → Frames als PNG extrahiert und mit `cwebp` (Paket
  `webp`) nach WebP konvertiert. Reproduzierbar via `scripts/hero-frames.sh`.
- Neue Komponente `components/marketing/hero-frame-background.tsx` (Client):
  spielt die Frame-Sequenzen als bewegten Hintergrund ab, blendet nach jedem
  Clip automatisch zum nächsten über (Endlosschleife), 2 gestapelte `<img>`-
  Ebenen, Vorab-Laden/Dekodieren, Clip-Wechsel per Cross-Fade. Respektiert
  `prefers-reduced-motion` (nur Standbild). Manifest:
  `components/marketing/hero-clips.ts` (dir/frames/fps müssen zur Extraktion
  passen).
- In `app/(marketing)/page.tsx` in die Hero-Section eingebunden (nichts
  entfernt): `relative isolate`-Wrapper + Hintergrund `-z-10` + dunkler
  Verlauf für Textlesbarkeit und weichen Übergang zur Marquee. tsc + Lint
  grün; Seite liefert 200, Frames als `image/webp`.
- Header-Overlay-Fix: Der Marketing-Header ist oben transparent, ist aber
  `sticky` und reservierte Platz → hinter ihm lag der dunkle Layout-Hintergrund
  (dunkler Balken). Landing-`<main>` bekommt `-mt-20` und wird so unter den
  transparenten Header gezogen; der bewegte Hintergrund ist jetzt auch hinter
  dem Header sichtbar. Innere Hero-Polsterung von `pt-16 md:pt-24` auf
  `pt-36 md:pt-44` erhöht, damit der Text an gleicher Position bleibt. Der
  Verlauf oben ist bewusst transparent (0–16 %), damit der Header-Bereich frei
  vom Video ist. Scroll-Verhalten des Headers unverändert.

## Letzte Änderungen (11. Juli 2026)

### Startseiten-Kapitel um Studio & Mediaspeicher erweitert
- Der Editorial-Abschnitt „Plattformen leihen dir Reichweite. Aera gehört zu dir."
  (`home.chapters`) wurde von **6 auf 7 Kapitel** erweitert und neu gegliedert,
  um die neuen Funktionen abzubilden:
  - **c5 „Studio, Mediaspeicher und KI"** (NEU): Image Studio (Bilder mit KI
    erzeugen, bearbeiten, Hintergrund freistellen, Qualität verbessern, Größe
    ändern — Ergebnisse landen automatisch im Mediaspeicher), Mediaspeicher
    (alle Uploads aus allen Bereichen an einem Ort, in Ordnern) und der
    KI-Assistent für Texte/Ideen.
  - **c6 „Motivation, die aktiv hält"**: Gamification (Punkte/Level/Abzeichen/
    Bestenliste) + passende Empfehlungen — geschärft, KI-Assistent nach c5
    verschoben.
  - **c7 „Alles unter deiner Marke"**: unverändert (vorher c6).
- `app/(marketing)/page.tsx`: `CHAPTER_IDS` um `c7` ergänzt.
- Übersetzt in allen 17 Vollkatalogen (de/en + 15). Marquee-Kacheln (14
  Space-Typen) bewusst unverändert — Studio/Mediaspeicher sind Dashboard-Tools,
  keine Space-Typen. en-GB-Override `chapters.c6` → `chapters.c7` verschoben
  (Marken-Text, britische Schreibweise). i18n-Tests (9/9) + tsc grün.

## Aktueller Fokus

**Creator Media-Bibliothek** unter Manage (`/dashboard/[slug]/media`): tenant-weite
Übersicht aller `StorageObject`-Uploads mit Ordnern, Drag-and-Drop und
Action-Dropdowns. Migration `20260711060000_media_folders` deployed.

## Letzte Änderungen (10. Juli 2026, Teil 10)

### Creator Media Library
- Nav: Manage → „Medien“ / „Media“ (`dashboard-nav.tsx`, Icon `gallery`).
- Seite: `app/(creator)/dashboard/[slug]/media/page.tsx` +
  `components/dashboard/media-library.tsx`.
- Schema: `MediaFolder` + `StorageObject.folderId` / `displayName`; RLS-Liste
  um `MediaFolder` ergänzt.
- Actions: create/rename/delete Folder, move/rename/delete Media in
  `app/actions/dashboard.ts`.
- UI: Accordion-Ordner, DnD in Ordner, ⋯-Menüs, Sheet für Create/Rename/Edit,
  Filter Tabs + Suche — Dashboard-Stil.
- i18n: `dashboard.nav.media` + `dashboard.media` in allen Vollkatalogen.

## Letzte Änderungen (10. Juli 2026, Teil 9)

### Gemini-Ausgaben in der aktiven Sprache
- Neue Helper `aiLanguageInstruction(locale)` in `lib/ai.ts` + englische
  Sprachnamen-Map `LOCALE_ENGLISH_NAMES` in `i18n/locales.ts` (Modell befolgt
  englische Sprachbezeichnungen am zuverlässigsten).
- AI-Assistent-Chat: `runAssistantTurn(..., locale)` hängt die Sprachanweisung
  ans System-Prompt; `SYSTEM` nicht mehr fest „auf Deutsch". Route
  `app/api/dashboard/assistant/route.ts` reicht `getLocale()` durch.
- Empfehlungs-Begründung (`displayRecommendations`): `locale`-Parameter (auch im
  Cache-Key!), Gemini-Prompt auf Englisch mit „Write it in {Language}."
  `app/c/[slug]/page.tsx` übergibt die aktive Locale.
- Bild-Assistent: Route hängt `aiLanguageInstruction(locale)` an den Bild-Prompt,
  damit begleitender Text in der Zielsprache erscheint.
- `geminiChat` nimmt optional `locale` (aktuell ungenutzt, konsistent gehalten).
  Moderation (`geminiGenerate` → JSON-Klassifikation) bleibt unberührt.
- Damit sind auch die dynamischen KI-Freitexte mehrsprachig. tsc + Tests grün.

## Letzte Änderungen (10. Juli 2026, Teil 8)

### Community-Render-Block migriert (alle 17 Sprachen) — i18n jetzt WIRKLICH komplett
- Neuer Namespace `community.render` (spaceTypes, spaceTypeSingular, productTypes,
  recTypes, recReason, home, shop, media, gallery, sidebar, space, spaceCard,
  postTile, planCard) + Erweiterung `dashboard.search` (Creator-Suchseite) —
  alle 17 Vollkataloge.
- Migriert: `app/c/[slug]/page.tsx` (Community-Startseite: Hero, Upsell, alle
  Sektionen, Leaderboard, Empfehlungen), `app/c/[slug]/s/[spaceSlug]/page.tsx`
  (ALLE Space-Typen: Feed/Forum/Blog/Gallery/Videos/Podcast/Course/Shop/Chat/
  Events/Newsletter/Knowledge/Links), `space-sidebar`, `shop-section` (jetzt
  async Server-Comp.), `gallery-folders`, `media-tile`, `post-tile` (+Slider),
  `space-slider`, `search/page.tsx` (Creator).
- Plan-Karten (`pricing/plan-card`, `marketing/marketing-plan-card`) nehmen jetzt
  `labels`-Props (locale + übersetzte Labels); Aufrufer `pricing/page.tsx` und
  `credits-sheet` liefern sie aus `community.render.planCard` (+ nf-formatierte
  Credits). Damit sind auch die letzten „Kostenlos"/„Beliebt"/„/Monat"-Reste weg.
- `lib/ai.ts`: Empfehlungs-`type` liefert jetzt Keys (product/post/event/course),
  heuristische `reason` liefert Keys (popular/interests/activity) — Übersetzung
  auf der Seite via `recTypes`/`recReason` (Gemini-Freitext bleibt dynamisch).
- `nf`/`timeAgo`/`formatDate`/`formatDateTime`/`formatPrice` überall
  locale-abhängig durchgereicht.
- WICHTIG (Test-Eigenheit): Der Placeholder-Test extrahiert `{\w` — ICU-Plural-
  Zweige MÜSSEN mit `#` beginnen (z. B. `{# Tag}`), nicht mit einem Wort.
  `inDays` daher als einfache `{count}`-Meldung (kein Plural) umgesetzt.
- tsc 0 Fehler, i18n-Tests grün (9/9), keine Lint-Fehler. Damit ist die
  i18n-Migration der GESAMTEN Anwendung (inkl. Community-Render) abgeschlossen.

## Letzte Änderungen (10. Juli 2026, Teil 7)

### Rest-Aufräumen: formatPrice locale-fähig + Admin-Metadaten
- `formatPrice(cents, currency, locale = "de", freeLabel = "Kostenlos")` — nicht
  mehr hart `de-DE`. Aktive Sprache wird durchgereicht bei allen i18n-fähigen
  Aufrufern: admin (overview/orders), payouts, credits-sheet, my-subscription,
  Dashboard-Overview, account, library, pricing, tiers-/products-/gallery-manager,
  join-Seite.
- Admin-Listenseiten: statische `export const metadata` → `generateMetadata`
  (getTranslations("admin.nav")): communities, users, media, posts, orders, help,
  audit. Layout-Metadaten bleiben Markenname.
- ENTDECKTE LÜCKE (separat, NICHT Teil dieser Aufgabe): die Community-Render-
  Komponenten `app/c/[slug]/page.tsx`, `s/[spaceSlug]/page.tsx`, `space-sidebar`,
  `gallery-folders`, `shop-section`, `media-tile`, die Plan-Karten
  (`pricing/plan-card`, `marketing/marketing-plan-card`) und die Creator-
  `search/page.tsx` sind noch NICHT i18n-migriert (hartes Deutsch wie „Dein
  Paket", „Beliebt", `typeLabel`, „Kostenlos"). Dort steht formatPrice weiterhin
  auf Default-Locale — konsistent mit dem restlichen deutschen Text dieser
  Flächen. Diese Flächen sind ein eigener Migrations-Block.

## Letzte Änderungen (10. Juli 2026, Teil 6)

### Plattform-Admin migriert (alle 17 Sprachen)
- Neuer Top-Level-Namespace `admin` (mit `nav`, `pagination`, `overview`,
  `communities`, `users`, `media`, `posts`, `orders`, `help`, `audit` + gemeinsame
  Keys wie `search`/`cancel`/`saveChanges`/`dangerZone`). 14 neue `errors`-Keys
  (userNotFound, emailInUse, cantDeleteYourself, userOwnsCommunities {count},
  userHasLinkedData, orderNotFound, categoryNotFound, help*TooShort/TooLong,
  helpAnswerRequired/TooLong) — alle in ALLEN 17 Vollkatalogen.
- `app/actions/admin.ts`: alle `return { error: … }` über `tErr(...)` übersetzt
  (Zod nicht nötig, manuelle Validierung).
- Migriert: `app/admin/layout.tsx`, `app/admin/page.tsx` (Overview, getLocale +
  Map-Var `t`→`tenant`), `audit/page.tsx`, `posts/page.tsx` (Default „Ohne Titel"),
  `components/admin/admin-nav.tsx` (items mit key statt label), `pagination.tsx`
  (jetzt async Server-Comp. mit getTranslations), `communities-manager.tsx`
  (t.rich `<code>{slug}</code>`, Kategorie-Labels aus `categories`-Namespace,
  Map-Var `t`→`tn`), `users-manager.tsx`, `media-manager.tsx`
  (visibilityMeta→Cls+Key-Maps), `posts-manager.tsx`, `orders-manager.tsx`
  (statusMeta→Cls+Key-Maps), `help-manager.tsx` (metaBefore + Link, ICU-Plural
  `articleCount`).
- `nf`/`formatDate`/`formatDateTime` überall locale-abhängig. tsc 0 Fehler,
  i18n-Tests grün (9), keine Lint-Fehler.

## Letzte Änderungen (10. Juli 2026, Teil 5)

### AI-Assistent-Workspace migriert (alle 17 Sprachen)
- Neuer Namespace `dashboard.assistant` (inkl. `.suggestions` und
  `.imageSuggestions` mit je `title`/`prompt`).
- Migriert: `components/dashboard/assistant-workspace.tsx` — Sidebar (Chats/
  Bilder, Neu, Archiviert-Zähler), Chat-/Bild-Leerzustände, Vorschläge (früher
  harte `SUGGESTIONS`/`IMAGE_SUGGESTIONS`-Arrays → jetzt `{ icon, key }` + t),
  Credits-Button, ModeSwitch, Eingabezeilen/Hinweise, Lösch-Dialog,
  ConversationRow (relTime via t + locale), ImageMessageRow (Alt-Texte/
  Speichern), GeneratingRow. Session-/API-Fehlermeldungen und
  Out-of-Credits-Text übersetzt.
- `nf` und `relTime`/`toLocaleDateString` jetzt locale-abhängig (`useLocale`).
  Unterkomponenten erhalten `t: AssistantT` (typisiert) per Prop.
- `assistant/page.tsx` enthält keine Strings. tsc 0 Fehler, i18n-Tests grün (9).

## Letzte Änderungen (10. Juli 2026, Teil 4)

### Space-Content Batch 6 (Abschluss, alle 17 Sprachen)
- Neue Namespaces `dashboard.announcements` und `dashboard.spaceContent`
  (+`typeLabels`/`createLabels`/`managedLabels`).
- Migriert: `announcements-manager.tsx` (statusInfo liefert Key statt Label,
  ColorInput-Aria via t, Live-Vorschau, alle Felder) und
  `space-content-manager.tsx` (generischer Manager für FEED/FORUM/BLOG/GALLERY/
  VIDEOS/PODCAST/KNOWLEDGE + Managed-Space-Verweise). Die deutschen Maps
  `typeLabel`/`createLabel`/`managed` durch i18n ersetzt (Icons/href/managedMeta
  bleiben im Code); Helper `useCreateLabel()`; Map-Var `t`→`ty` (Kollision).
  `formatDate`/`formatDateTime` locale-abhängig.
- Damit ist der gesamte Space-Content-Block abgeschlossen. tsc + i18n-Tests grün.

## Letzte Änderungen (10. Juli 2026, Teil 3)

### Space-Content-Manager — Batch 1 (alle 17 Sprachen)
- Neue Namespaces `dashboard.rte` (geteilter Rich-Text-Editor — profitiert allen
  Content-Managern), `dashboard.links`, `dashboard.events`.
- Migriert: `rich-text-editor.tsx` (Placeholder jetzt via t, Default-Prop
  entfernt), `links-manager.tsx`, `events-manager.tsx` (formatDateTime mit
  useLocale). ICU-Plurale für Link-/Event-/RSVP-Zähler.
- tsc 0 Fehler, i18n-Tests grün. Restliche Content-Manager folgen in weiteren
  Batches.

## Letzte Änderungen (10. Juli 2026, Teil 2)

### Dashboard „Einstellungen" migriert (alle 17 Sprachen)
- Neue Namespaces `dashboard.settings` (+`.stripeTest`), `dashboard.branding`,
  `dashboard.domain`, `dashboard.danger`, `dashboard.developers` (+`.events`),
  `dashboard.export` (+`.datasets`), `dashboard.moderation` (+`.categories`),
  `dashboard.layout` (+`.audiences`/`.sections`/`.sectionGroups`/`.navTypes`).
- Migrierte Dateien: `settings/page.tsx`, `settings-panels.tsx` (Branding/
  Domain/DangerZone), `stripe-test.tsx` + `app/actions/integration-test.ts`
  (Server-Testmeldungen jetzt übersetzt), `developers/page.tsx` +
  `developers-manager.tsx`, `export/page.tsx`, `moderation/page.tsx`,
  `layout/page.tsx` via `layout-editor.tsx`.
- `lib/layout.ts` bleibt Quelle für Icons/Typen/Default-Labels; die Editor-
  Anzeige zieht Labels aus `dashboard.layout.*` (Section-Gruppen via GROUP_KEY-
  Mapping deutsche Gruppe→Key). Visibility-Labels aus `dashboard.visibility`,
  Kategorien aus `categories` wiederverwendet.
- Webhook-Event-IDs (`member.joined` etc.) via `EVENT_KEYS`-Map auf sichere
  Übersetzungs-Keys (`memberJoined` …) gemappt (Punkt-Keys vermeiden).
- `t.rich` mit `<code>`/`<b>` für Stripe-Hinweis, API-/Webhook-Beschreibung,
  DNS-Optionen. tsc 0 Fehler, i18n-Tests grün.

## Letzte Änderungen (10. Juli 2026)

### Dashboard „Wachstum" migriert (alle 17 Sprachen)
- Neue Namespaces `dashboard.analytics`, `dashboard.gamification` (inkl.
  `.triggers` und `.criteria`), `dashboard.referrals`, `dashboard.automations`.
- Migrierte Dateien: `analytics/page.tsx`, `gamification-manager.tsx`,
  `referral-settings.tsx`, `referrals/page.tsx`, `automations-manager.tsx`,
  `automations/page.tsx`. Server-Seiten nutzen `generateMetadata` +
  `getTranslations`/`getLocale`; `Intl.NumberFormat`/`DateTimeFormat` jetzt
  locale-abhängig statt hart `de-DE`.
- ICU-Plurale für Abos/Bestellungen/Teilnehmende/Lektionen; `t.rich` für
  Conversion-Zeilen (`convJoin`/`convPurchase`), Cron-Warnung und Platzhalter-
  Hinweis (`<code>`). Template-Tokens `{{name}}`/`{{community}}` werden als
  Werte (`nameVar`/`communityVar`) übergeben, um ICU-Escaping zu vermeiden.
- tsc 0 Fehler, i18n-Tests grün.

## Letzte Änderungen (9. Juli 2026)

### Übersetzungen abgeschlossen (kundenseitig) + Dashboard-Navigation
- **Server-Fehlermeldungen** (`errors`-Namespace): Alle `return { error: … }`
  in den Server-Actions (auth, account, community, subscription, engage,
  dashboard, announcements, ads, links, developers, automations, referrals,
  page-layout) übersetzt. Neuer Helper `lib/action-errors.ts`
  (`getErrorTranslator`, `zodError`, `tErr`, `zodErr`). Zod-Meldungen in
  `lib/validation.ts` und die Auth-Fehler in `lib/auth.ts` sind jetzt Keys aus
  `errors.*` (Übersetzung in der aufrufenden Action). `admin.ts`
  (Plattform-Admin) bewusst noch NICHT migriert.
- **Bibliothek** (`library`), **Hilfe-Center** (`help`), **Konto-Seite**
  (`account`, inkl. `member-settings`, `totp-settings`, `push-settings`) —
  vollständig migriert und in allen 17 Vollkatalogen übersetzt.
- **Creator-Dashboard**: Navigation (`dashboard.nav.*`) migriert
  (`dashboard-nav.tsx`, `mobile-nav.tsx`), alle 17 Kataloge. Der Rest des
  Dashboards (ca. 45 Manager-Komponenten + Seiten-Bodies) ist noch hart
  deutsch — größte Restfläche, laut Vorgabe am wenigsten dringlich.
- **Datumsausgabe**: migrierte Seiten reichen `getLocale()` an
  `formatDate`/`timeAgo` durch. `formatPrice` bleibt vorerst de-DE (shared).
- Vollständigkeits-Test (`tests/i18n.test.ts`) deckt jetzt zusätzlich
  `errors./library./help./account./dashboard.` ab. 137 Tests grün, tsc 0 Fehler.

## Frühere Änderungen (6. Juli 2026)

**AI-Assistent** — Bildgenerierung ergänzt; zuvor Marketing-Texte und Logo.

## Letzte Änderungen (6. Juli 2026)

### AI-Assistent: getrennte Chat- & Bild-Verläufe
- `AssistantConversation` hat jetzt ein Feld **`kind`** ("CHAT" | "IMAGE")
  (Migration `20260706211500_assistant_conversation_kind`).
- **Bild-Verläufe werden persistiert** (eigene IMAGE-Conversations): Prompt,
  hochgeladene Vorlagen (als Storage-URLs) und Ergebnisse werden als JSON in
  `AssistantMessage` gespeichert (`appendImageTurn` in `lib/assistant.ts`).
- Die **Sidebar zeigt je Tab die passenden Verläufe**: „Chats" im Chat-Tab,
  „Bilder" im Bild-Tab (Filter nach `kind`). Zwei getrennte aktive IDs
  (`activeId` / `activeImageId`); „Neu", Öffnen, Archivieren, Löschen wirken
  modus-spezifisch.
- Conversations-Route unterstützt `?kind=`; `listConversations(…, kind?)`.

### AI-Assistent: Bild-Modus (Bildgenerierung)
- Neuer **Switch „Chat / Bild"** rechts neben dem Credits-Button im Assistenten
  (`components/dashboard/assistant-workspace.tsx`, Komponente `ModeSwitch`).
- **Chat-Modus** unverändert. **Bild-Modus** = eigener (session-basierter) Thread:
  Prompt eingeben, bis zu **4 Referenzbilder** hochladen (je max. 5 MB), generieren.
  Ergebnisse werden inline angezeigt und sind per „Speichern" herunterladbar.
- Modell: **`gemini-3.1-flash-image`** (verifiziert; liefert `inlineData` image/jpeg
  + `usageMetadata`). Neue Env-Var `GEMINI_IMAGE_MODEL` (Default gesetzt) in
  `lib/env.ts`, `.env`, `.env.example`.
- Neue Lib-Funktion `geminiGenerateImage()` in `lib/ai.ts` (Text + optionale
  Referenzbilder → Bilder), `GeminiPart` um `inlineData` erweitert.
- Neue API-Route `app/api/dashboard/assistant/image/route.ts`: Admin-Gate,
  Credit-Gate (`hasCreditsLeft`), Generierung, Speicherung generierter Bilder als
  `StorageObject` (purpose `assistant-image`, visibility PUBLIC, UUID-Key),
  Credit-Abrechnung via `consumeCredits({ kind: "image_generation" })`
  (Fallback 1290 Tokens, wenn keine Usage geliefert wird).

## Frühere Änderungen (5. Juli 2026)

### 1. Features-Seite (`app/(marketing)/features/page.tsx`)
- `sections`-Array von **8 auf 13 Abschnitte** erweitert, damit **wirklich alle**
  Features aufgelistet sind:
  1. Eigene Community & Marke · 2. Bereiche (14 Typen) · 3. Beiträge/Kommentare/
     Reaktionen + Ankündigungen · 4. Mitgliedschaften & Bezahlung · 5. Kurse & Events ·
     6. Newsletter · 7. Chat/Nachrichten/Live · 8. Mediathek (Bilder/Videos/Podcast) ·
     9. Belohnungen/Gamification · 10. KI-Assistent & Empfehlungen · 11. Mitglieder
     verwalten · 12. Entdecken · 13. Datenexport/Datenhoheit.

### 2. Startseite (`app/(marketing)/page.tsx`)
- Im Abschnitt **„Plattformen leihen dir Reichweite. Aera gehört zu dir."** die
  `chapters` von **4 auf 6 Kapitel** erweitert (u. a. neues Kapitel „Chat, Nachrichten
  und Live" sowie „Alles unter deiner Marke").
- Verbliebene Fachsprache entschärft: Monetarisierungs-Absatz (kein „Stripe Checkout/
  Connect", „Webhook"), Ownership-Abschnitt „Deine Daten." (kein „JSON-Export",
  „Row Level Security", „auf Datenbank-Ebene isoliert") und „Deine Adresse."
  (kein „Subdomain/Custom Domains").

### 3. Sprachregel etabliert
- **Kundenseitig keine Programmierer-Fachsprache.** Ersetzungen z. B.:
  Tenant/RLS/isoliert → „sauber getrennt & geschützt"; Entitlements/Webhook → „schaltet
  sich automatisch frei"; JSON-Export → „alle Daten herunterladen"; RSVP → „Zu-/Absagen";
  Segmente → „gezielte Gruppen"; Subdomain → „eigene Internetadresse".

### 4. Memory Bank angelegt
- `memory-bank/` mit allen sechs Kern-Dateien neu erstellt (vorher nicht vorhanden).

## Offene Punkte / Entscheidungen

- **Brand-Begriff „Spaces":** In Fließtexten zu „Bereiche" geändert. Im Hero und auf
  den Marquee-Kacheln der Startseite steht als Design-Element weiterhin „Space".
  → Offen, ob auch dort auf „Bereiche" umzustellen ist.
- Consistency-Check für weitere Marketing-/Community-Texte (Pricing, Hilfe) auf
  gleiche kundenfreundliche Sprache noch nicht durchgeführt.

## Nächste sinnvolle Schritte

1. Auf Wunsch: „Space" auch in Hero/Marquee der Startseite zu „Bereiche" vereinheitlichen.
2. Pricing- und Hilfe-Seite auf gleiche Sprachregel prüfen.
3. `progress.md` bei weiteren Änderungen aktuell halten.
