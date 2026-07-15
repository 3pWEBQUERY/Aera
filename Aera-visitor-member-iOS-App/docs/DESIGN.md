# Aera iOS — Design-Spec (verbindlich)

Übersetzt das Web-Design-System (warmes Papier, Editorial-Serifen, Tenant-Branding) nach iOS 26 mit **nativem Liquid Glass**. Kein Nachbau von Web-Chrome: iOS-native Navigation, aber exakt die Aera-Farb- und Typo-Sprache.

## 1. Farb-Tokens (`Theme.swift`, alle Werte fix aus der Web-App)

| Token | Wert | Verwendung |
|---|---|---|
| `Theme.paper` | `#F4F1EA` | App-/Screen-Hintergrund (alle Community-Screens) |
| `Theme.ink` | `#161613` | Primärtext. Abstufungen via `.opacity(0.8/0.7/0.55/0.5/0.45)` |
| `Theme.card` | `#FFFFFF` | Karten |
| `Theme.rail` | `#0F0F0D` | dunkle Kontrastflächen (Upsell-Banner, Podium) |
| `Theme.border` | `ink.opacity(0.10)` | Hairlines/Karten-Border |
| `Theme.softFill` | `ink.opacity(0.05)` | Chips, Hover-Flächen |
| `Theme.defaultBrand` | `#6D28D9` | Fallback-Brand (Aera-Violett) |
| `Theme.defaultAccent` | `#EC4899` | Fallback-Akzent |
| `Theme.danger` | `#DC2626` | destruktiv |
| `Theme.amber*` | amber-50/200/800 | Hinweise |

**Tenant-Branding:** `BrandTheme`-Struct aus `primaryColor`/`accentColor` (Hex-Parser). Abgeleitet wie im Web:
`brandSoft` = brand @ 12 % auf Weiß gemischt, `brandHover` = brand @ 85 % auf Schwarz. Per `Environment(\.brand)` an den gesamten Community-Baum, zusätzlich `.tint(brand.color)` auf dem Community-Root (färbt native Controls, Toggle, ProgressView, Links, Glass-Interaktionen).

Kein Dark Mode (die Web-App hat keinen): Root setzt `.preferredColorScheme(.light)`, Assets ohne Dark-Varianten.

## 2. Typografie

- **Display-Serif** (ersetzt Playfair Display nativ): `.font(.system(size:, weight: .semibold, design: .serif))` — New York. Tracking leicht negativ via `.kerning(-0.4)` bei großen Titeln.
  - Hero/Community-Name groß: 34 pt; Section-Header: 22 pt; Post-Titel Liste: 20 pt; Detail-Titel: 26 pt.
- **UI**: SF (System default). Meta 13 pt `.secondary`-Optik = `ink.opacity(0.5)`; Eyebrow-Labels: 11 pt, `.semibold`, `.uppercase`, `.kerning(1.6)`, `ink.opacity(0.55)`.
- Zahlen: `.monospacedDigit()` bei Punkten/Countdowns/Preisen. Preise: 28 pt bold, tight.

Helper in `Theme.swift`: `Font.displaySerif(_ size:)`, `View.eyebrowStyle()`.

## 3. Formen, Karten, Effekte

- Radii: Karten 12 (`rounded-xl`) und 16 (`rounded-2xl` für Info-/Tier-Karten), Hero-Cover 24, Buttons/Chips Kapsel, Inputs 10.
- Karte = weiß, Radius 12/16, Hairline `Theme.border`, Schatten `black.opacity(0.05), radius 8, y 2`. Komponente `AeraCard { content }` (padding 20).
- **Avatar = abgerundetes Quadrat**, Corner-Radius = `size * 0.27` (nie Kreis!), Ring `black.opacity(0.05)`. Fallback: Initialen `.semibold` in `brand.color` auf `brand.soft`. Komponente `AvatarView(url:name:size:)` (Default 36).
- Pills: Kapsel, `softFill`-Hintergrund, 12 pt medium; Brand-Chip: `brand.soft` + `brand.color` semibold (Punkte, Level).
- Buttons:
  - Primär: Kapsel, Fill `brand.color`, weiß, `pressed → brandHover`; Komponente `BrandButtonStyle`.
  - Sekundär: weiß + Hairline; Ghost: nur Text `ink.opacity(0.6)`.
  - Glas-CTAs (auf Bildern/Covern): `.buttonStyle(.glass)` bzw. `.glassEffect(.regular.tint(brand.color).interactive())`.
- **Liquid Glass (nativ, iOS 26):**
  - TabBar/Toolbar: Systemstandard (automatisch Glass) — nicht überschreiben.
  - Space-Chip-Bar (horizontal scrollende Space-Navigation im Community-Screen): Chips in `GlassEffectContainer`, aktiver Chip `.glassEffect(.regular.tint(brand.color).interactive())` mit weißem Text, inaktive `.glassEffect(.regular.interactive())`.
  - Gesperrte Inhalte (Paywall-Teaser): Cover/Teaser-Bild + Overlay `brand.color.opacity(0.25)` + `.ultraThinMaterial`-Blur, mittig Lock-Icon in Glass-Kreis (`.glassEffect(.regular, in: .circle)`), darunter weißer Kapsel-Button „Freischalten ab X €".
  - Story-Ring/Overlay-Controls, Floating-Compose-Button: `.glassEffect(...).interactive()`.
  - `ScrollView` mit `.scrollEdgeEffectStyle(.soft, for: .top)` unter großen Titeln.
- Animationen: dezent. `.animation(.snappy(duration 0.25))` für Toggles/Votes, `.contentTransition(.numericText())` für Zähler, Karten-Push ohne Custom-Transitions. `matchedTransitionSource`/`navigationTransition(.zoom)` für Cover → Detail (Posts mit Bild, Gallery).

## 4. Navigations-Architektur (iOS-nativ)

Root `TabView` (systemseitig Liquid Glass):
1. **Entdecken** (`house`/`sparkles`) — Discover-Feed (Suche via `.searchable`, Kategorien-Chips, Sektionen „Meine Communities", „Beliebt", „Neu").
2. **Meine Communities** (`person.2`) — Mitgliedschaften als Karten-Liste.
3. **Konto** (`person.crop.circle`) — Profil, Bestellungen, Einstellungen.

**Community-Screen** (Push in NavigationStack, eigener Brand-Kontext):
- Hero: Cover 16:9 (Radius 24) bzw. Brand-Fläche mit Serif-Initiale; Logo (Radius 8) + Name in Display-Serif 28; Tagline; Mitglieder/Punkte-Chips.
- Darunter **sticky Space-Chip-Bar** (Glass, horizontal): ein Chip je zugänglichem/angezeigtem Space, Icon per Space-Typ (SF Symbols Mapping unten), Lock-Badge bei gesperrten. Auswahl rendert den Space-Content **inline** darunter (kein Push) — entspricht der Web-Topnav.
- Toolbar rechts: Glocke (Badge = unreadNotifications), Suche; Nichtmitglieder: prominenter „Beitreten"-Button (Brand-Kapsel) statt Glocke.
- Post-/Kurs-/Event-Details, Chat-Threads, Leaderboard, Members etc. = Push.

**SF-Symbol-Mapping** (Space-Typ → Icon): FEED `square.text.square`, FORUM `bubble.left.and.bubble.right`, BLOG `text.book.closed`, VIDEOS `play.rectangle`, PODCAST `waveform`, GALLERY `photo.on.rectangle.angled`, COURSE `graduationcap`, SHOP `bag`, EVENTS `calendar`, NEWSLETTER `envelope.open`, KNOWLEDGE `books.vertical`, LINKS `link`, LIVE `dot.radiowaves.left.and.right`, CHAT `message`, REQUESTS `lightbulb`, BOOKING `clock.badge.checkmark`, STORIES `circle.dashed.rectangle.portrait` (fallback `rectangle.portrait.on.rectangle.portrait`), TIPS `heart`, CALENDAR `calendar.day.timeline.left`.

## 5. Wiederverwendbare Komponenten (Core/DesignSystem)

`AeraCard`, `AvatarView`, `BrandButtonStyle` / `SecondaryButtonStyle`, `PillLabel`, `EyebrowLabel`, `LockedOverlay(unlock:)`, `EmptyStateView(icon:title:message:)` (gestrichelte Border, Brand-Icon-Badge), `SectionHeader(serif title + optional trailing)`, `PriceText(cents:currency:interval:)`, `LevelChip`, `RoleBadge`, `AsyncImageView` (AsyncImage + paper-Placeholder mit ProgressView), `HTMLTextView` (AttributedString aus HTML für Blog/Newsletter/Knowledge, Serif-Body 17 pt, line-height ~1.7), `RemoteVideoPlayer` (AVKit `VideoPlayer`), `AudioPlayerBar` (Podcast, AVPlayer + Play/Pause/Progress).

Leaderboard-Medaillen: 1 amber, 2 grau, 3 orange — Kreis-Badges wie Web.

## 6. Ton & Qualität

- Texte: klare, kurze deutsche Quellstrings (werden lokalisiert), keine Emojis, keine Ausrufezeichen-Inflation.
- Ladezustände: `ProgressView` auf `paper`, Skeleton nicht nötig. Fehler: inline Karte mit Retry, `ContentUnavailableView` für leere Zustände wo passend.
- Pull-to-Refresh überall (`.refreshable`), Pagination via `onAppear` des letzten Elements.
- Haptik: `.sensoryFeedback(.impact(weight: .light))` bei Like/Vote/RSVP-Erfolg.
