# Aeli

Link-in-Bio auf `aeli.so`. Öffentliche Seiten liegen unter `{handle}.aeli.so`.

Eigenständige Next.js-App, **dieselbe PostgreSQL-Datenbank wie Aera**, dasselbe
`User`-Konto. Wer auf aera.so registriert ist, meldet sich hier mit denselben
Zugangsdaten an.

---

## Der Aufbau in drei Sätzen

`proxy.ts` schreibt `{handle}.aeli.so` auf `/p/{handle}` um; der Apex bleibt
unverändert (Marketing, Anmeldung, Studio). Die App spricht über zwei
Prisma-Clients mit der Datenbank — den normalen, der jede Abfrage unter der
Rolle `aeli_app` ausführt, und einen privilegierten für die drei Dinge, die
diese Rolle nicht darf. Gerendert wird die Bio-Seite von genau einem Satz
Komponenten, sowohl live als auch als Vorschau im Studio.

```
aeli.so/
  proxy.ts                 Host-Routing
  app/
    (marketing)/page.tsx   aeli.so/
    (auth)/                /login, /signup
    onboarding/            Handle sichern
    studio/                Seite · Design · Statistik · Einstellungen
    p/[handle]/            die öffentliche Seite (+ OG-Bild, eigene 404)
    api/                   track · lead · qr · handle · upload · media · health
    actions/               Server Actions
  components/
    page/                  die Bio-Seite (live UND Vorschau)
    studio/                der Editor
    ui/                    Knöpfe, Felder
  lib/                     Datenzugriff, Themes, Blöcke, Analytics
  prisma/schema.prisma     Spiegelschema — hier wird NICHT migriert
```

## Datenbank

Das Schema lebt in Aera (`../prisma/schema.prisma`), die Migrationen ebenfalls.
`aeli.so/prisma/schema.prisma` ist eine bewusst reduzierte Spiegelung, die nur
den Client erzeugt: sie enthält die sechs Aeli-Tabellen plus so viel von `User`
und `Tenant`, wie die App wirklich anfasst.

Ausrollen — **aus dem Wurzelverzeichnis**, nicht von hier:

```bash
npm run db:deploy
```

Danach prüfen, dass Rolle, Policies und Rechte stehen:

```bash
cd aeli.so && npm run db:rls
```

### Warum eine eigene Rolle

Aeras RLS isoliert nach `aera.tenant_id`. Aeli ist nicht tenant-scoped: es gibt
einen Besitzer (`userId`) und eine Öffentlichkeit (`status = 'PUBLISHED'`).
Dieselbe Rolle für zwei verschiedene Isolationsbegriffe wäre die Art von
Vermischung, die man ein Jahr später nicht mehr auseinanderhält — also gibt es
`aeli_app` mit dem GUC `aeli.user_id`:

```sql
SET LOCAL ROLE aeli_app;
SELECT set_config('aeli.user_id', '<user-id>', TRUE);  -- nur im Studio
```

Ohne gesetzten GUC bleibt sichtbar, was veröffentlicht ist — das ist der
öffentliche Lesepfad der Bio-Seite. Die Seite braucht deshalb keine einzige
eigene `where`-Klausel, um sicher zu sein.

`aeli_app` hat auf `User` **gar keine** Rechte. Registrierung und Anmeldung
laufen über die privilegierte Verbindung; `AeliProfile` trägt Anzeigename und
Avatar selbst.

### Die privilegierten Pfade

Alles andere läuft unter `aeli_app`. Diese vier nicht, jeweils mit Grund:

| Wo | Warum |
|---|---|
| `lib/auth.ts` | schreibt und liest `User` — für `aeli_app` gesperrt |
| `lib/handle-availability.ts` | „ist der Handle frei?“ muss auch fremde **Entwürfe** sehen; gibt nur ja/nein zurück |
| `lib/profile.ts` → `tenantIsLive` | `LiveSession` ist eine tenant-scoped Aera-Tabelle; die Frage ist auf eine `tenantId` begrenzt |
| `lib/payouts.ts`, `lib/tips.ts` | wohin Geld geht, hängt an `Tenant.ownerId` und `Tenant.stripeAccountId` — beide für `aeli_app` gesperrt |

Dazu zwei eng gefasste Stellen: der Klickzähler in `api/track` (ein `UPDATE`
mit ausgeschriebener Policy-Bedingung) und die Besitzprüfung beim Verknüpfen
einer Community.

`lib/aera-content.ts` gehört ausdrücklich **nicht** dazu: die Inhalte der
`AERA_*`-Bausteine kommen über `aeli_app` und damit durch die Policies. Der
Unterschied zu `tenantIsLive` ist der Umfang — ein Ja/Nein durfte eine
Ausnahme sein, fünf Inhaltstabellen nicht.

## Trinkgeld und Stripe

Der Baustein `TIP` ist der einzige, bei dem Geld fließt. Er kennt zwei
Zustände, und den Unterschied macht nicht ein Feld, sondern ein verbundenes
Auszahlungskonto:

| Konto verbunden | Was der Baustein ist |
|---|---|
| ja | Beträge zum Antippen, freier Betrag, Gruß — Checkout bei Stripe |
| nein | der Link, der beim Baustein hinterlegt ist (das, was er vorher war) |

### Woher das Konto kommt

`lib/payouts.ts`, in dieser Reihenfolge:

1. ein Stripe-Konto, das der Creator **in Aeli** verbunden hat
   (Einstellungen → Zahlungen);
2. das Konto der **verknüpften Aera-Community** — aber nur, wenn sie
   demselben Konto gehört.

Punkt zwei ist der Grund für die ganze Datei. `AeliProfile.linkedTenantId`
kann über einen Verbindungscode auf eine **fremde** Community zeigen. Ohne den
Besitzvergleich liefe jedes Trinkgeld an eine solche Seite auf das Stripe-Konto
eines Dritten. Der Vergleich steht deshalb in der `where`-Klausel und nicht in
einem `if` danach — ein Test in `tests/tips.test.ts` hält beides fest.

Beide Apps benutzen **dieselbe Stripe-Plattform** (`STRIPE_SECRET_KEY`, gleicher
Variablenname wie in Aera). Anders ginge Punkt zwei nicht: eine
`acct_…`-Kennung gilt nur innerhalb der Plattform, die sie angelegt hat.

### Der Weg einer Zahlung

```
Besucher wählt Betrag
  → app/actions/tip.ts        Grenze pro Herkunft, Betrag prüfen
  → lib/tips.ts               Profil veröffentlicht? Baustein sichtbar?
                              Konto bestimmt? Bei Stripe freigegeben?
  → AeliTip (PENDING)         mit destinationAccountId und Gebühr
  → Stripe Checkout           Destination-Charge, application_fee
  → zurück auf die Bio-Seite  ?danke=1
  → Webhook                   checkout.session.completed → PAID
```

`AeliTip` und `AeliPayoutAccount` sind für `aeli_app` **nur lesbar**.
Angelegt und fortgeschrieben wird über die privilegierte Verbindung — wer
`Tenant.ownerId` braucht, um ein Ziel zu bestimmen, kann nicht unter einer
Rolle laufen, die diese Spalte nicht sieht.

### Einrichten

```bash
STRIPE_SECRET_KEY=sk_test_…            # derselbe wie in Aera
AELI_STRIPE_WEBHOOK_SECRET=whsec_…     # EIGENER Endpunkt, nicht Aeras
AELI_PLATFORM_FEE_PERCENT=5            # optional, Voreinstellung 5
```

Der Webhook-Endpunkt zeigt auf `POST /api/stripe/webhook` und braucht
`checkout.session.completed` und `charge.refunded`. Lokal:

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

Ohne `STRIPE_SECRET_KEY` bleibt alles davon aus — der Trinkgeld-Baustein ist
dann ein Link, und die Einstellungen sagen das auch.

## Bilder

Profil- und Titelbild werden im Studio hochgeladen (Design → „Wer bist du?").
Sie landen in einem **eigenen Bucket im Railway-Projekt „Aeli.so"** — nicht in
dem von Aera. Ein Bucket pro Produkt heißt: ein durchgesickerter Schlüssel
öffnet nur die eigene Hälfte, und die Speicherkosten lassen sich zuordnen.

Werte holen und in `.env` eintragen:

```bash
railway link --project "Aeli.so" && railway bucket credentials --bucket <name> --json
```

### Warum die Datei durch den Server läuft

Es gibt keinen vorsignierten Direkt-Upload. Der Server ist die einzige Stelle,
die das Bild wirklich *ansehen* kann — und er reicht es nicht durch, sondern
erzeugt es neu (`lib/images.ts`):

| | |
|---|---|
| **Tempo** | 2400 × 1800 aus der Kamera → 512 × 512 WebP. Im Test: 141 KB → 3 KB. Eine Bio-Seite wird im Mobilfunknetz geöffnet. |
| **Datenschutz** | Handyfotos tragen EXIF, oft mit GPS-Koordinaten. Wer sein Profilbild zu Hause macht, würde sonst seine Adresse veröffentlichen. Das Neukodieren wirft die Metadaten weg. |
| **Sicherheit** | Was zwischen den Pixeln steckte — angehängte Archive, ein Skript in einem SVG, ein Payload für einen Decoder-Fehler — überlebt die Umwandlung nicht. Erkannt wird an den echten ersten Bytes, nicht am `Content-Type` des Browsers. SVG bleibt dauerhaft draußen. |

Der Objektschlüssel ist `aeli/{userId}/{avatar|banner}-{hash}.webp`. Der Hash
steht über dem *fertigen* Bild: dieselbe Adresse zeigt für immer auf denselben
Inhalt, `Cache-Control: immutable` ist damit keine Behauptung. Beim Austauschen
wird das vorherige Objekt gelöscht — aber nur, wenn es aus unserem Bucket
stammt.

### Der Hintergrund einer Seite

`AeliProfile.theme` ist eine Json-Spalte, und der Hintergrund darin ist ein
eigenes Objekt statt einer Farbe — eine markierte Union mit vier Zuständen:

| `kind` | was drinsteht |
|---|---|
| `preset` | nichts — es gilt, was der Look mitbringt. Der Ausgangszustand aller Profile. |
| `solid` | eine geprüfte Hex-Farbe |
| `gradient` | Form (gerade/rund/fächer), Winkel und 2–6 Farbstopps |
| `image` | ein Bild aus dem eigenen Bucket, plus Unschärfe und Abdunklung |

Erweitert wird das, indem eine Variante dazukommt; bestehende Profile merken
davon nichts. Geprüft wird in `parseTheme`/`parseBackground` — jeder Wert gegen
die erlaubte Menge, alles Unbekannte fällt weg. Das ist keine Förmlichkeit: die
Werte landen als CSS-Variablen in einem inline `<style>`, ein ungeprüftes Feld
wäre also eine offene Tür für fremde Deklarationen auf einer öffentlichen Seite.

**Lesbarkeit wird berechnet, nicht gehofft.** Sobald ein eigener Hintergrund
gesetzt ist, leitet `resolveTheme` Schrift-, Flächen- und Randfarben neu ab —
aus der Helligkeit der Fläche (bei einem Verlauf aus dem Mittel seiner Stopps).
Sonst stünde die weiße Schrift von „Mitternacht" auf einem weißen Foto. Wer die
Rechnung überstimmen will, setzt `textTone` von Hand.

### Ausgeliefert wird über `/api/media/...`

Railway-Buckets sind privat; es gibt keine öffentliche Objektadresse. Statt den
Bucket zu öffnen — was jede jemals hochgeladene Datei erratbar machen würde —
liefert eine eigene Route aus, begrenzt auf das Präfix `aeli/`, mit ETag und
einem Jahr `immutable`.

Wer den Bucket doch öffentlich schaltet oder ein CDN davorsetzt, trägt
`S3_PUBLIC_URL` ein; dann zeigen die gespeicherten Adressen direkt dorthin und
die Route wird nicht mehr aufgerufen.

## Die Brücke zu Aera

Beide Produkte teilen sich die `User`-Tabelle. Wer sich auf aera.so anmeldet,
**ist** auf aeli.so dieselbe Person — „Konten verknüpfen“ gibt es deshalb gar
nicht. Was es gibt, ist `AeliProfile.linkedTenantId`: der Zeiger von einer
Bio-Seite auf eine Community. Er schaltet sieben Bausteine frei.

### Die sieben Bausteine, die eine Community brauchen

| Baustein | Zeigt | Quelle |
|---|---|---|
| `COMMUNITY_CTA` | Beitreten-Knopf mit Logo und Tagline | `Tenant` |
| `LIVE_NOW` | Erscheint nur, solange gesendet wird | `LiveSession` |
| `AERA_EVENTS` | Kommende Termine, Abrisskalender | `Event` |
| `AERA_TIERS` | Öffentliche Stufen mit Preis | `MembershipTier` |
| `AERA_SHOP` | Produkte als Kachelraster | `Product` |
| `AERA_COURSES` | Veröffentlichte Kurse | `Course` |
| `AERA_SPACES` | Öffentliche Räume als Chips | `Space` |

Die fünf `AERA_*` tragen keinen eigenen Inhalt. Der Creator stellt sie einmal
hin, danach zeigen sie, was gerade in Aera steht — ein verschobener Termin
verschiebt sich mit, ein zurückgezogenes Produkt verschwindet. Genau darum
geht es: abgetippte Inhalte laufen auseinander, sobald sich das Original
ändert. Ist eine Liste leer, rendert der Baustein **nichts** — eine Community
ohne kommenden Termin ist kein Fehler.

Sichtbar wird dabei ausschließlich, was ein abgemeldeter Besucher auf der
Community-Seite ohnehin sähe. Das steht nicht in den `where`-Klauseln von
[`lib/aera-content.ts`](lib/aera-content.ts), sondern in den RLS-Policies der
Migration `20260808120000_aeli_aera_blocks`: öffentlicher, nicht archivierter
Raum ohne Bezahlschranke, veröffentlichter Inhalt, aktiver Tenant. Die Spalten
mit Zugriffscharakter — `meetingUrl`, `downloadUrl`, `streamUrl`, die
Stripe-Kennungen, die Entitlement-Schlüssel — sind der Rolle `aeli_app` gar
nicht erst gewährt; eine kaputte Policy könnte sie nicht ausliefern.

Das Spiegelschema führt für diese fünf Tabellen deshalb nur die gewährten
Spalten. `npm test` prüft das gegeneinander: ein Feld im Spiegel, das kein
`GRANT` deckt, wäre eine Abfrage, die in Produktion mit „permission denied"
mitten im Seitenaufbau scheitert.

Gesetzt werden kann der Zeiger von beiden Seiten:

| Von wo | Wann |
|---|---|
| Aeli-Studio → Einstellungen → Community | Die Community gehört demselben Konto. Auswahlliste. |
| Aera-Dashboard → Einstellungen → Integrationen | Dito, plus: die Aeli-Seite lässt sich dort auch **anlegen** (Handle sichern), ohne den Umweg über aeli.so. |
| Verbindungscode | Die beiden Seiten gehören **verschiedenen Konten** (unterschiedliche E-Mail). |

### Warum es einen Verbindungscode gibt

Wer seine Aeli-Seite unter einer anderen E-Mail angelegt hat, hat zwei
getrennte Identitäten — und keine davon darf allein entscheiden, dass sie
zusammengehören. Die Community-Seite stellt deshalb eine befristete Erlaubnis
aus (30 Minuten), die Bio-Seite löst sie ein.

Der Code trägt Tenant-ID und Ablaufzeit selbst und ist mit `AELI_LINK_SECRET`
signiert — **derselbe Wert in beiden Apps**. Keine Tabelle, keine Migration.
Einmalig ist er bewusst nicht: dafür bräuchte es gespeicherten Zustand, und der
Code erlaubt nur eine Sache, die der Community-Besitzer jederzeit wieder lösen
kann.

`lib/link-code.ts` ist eine wortgleiche Kopie von Aeras `lib/aeli-link-code.ts`;
dass beide nicht auseinanderlaufen, sichert dort `tests/aeli-integration.test.ts`
ab (er vergleicht die Dateien).

## Entwickeln

```bash
npm install
npm run dev          # http://localhost:3001
```

Lokal gibt es keine Subdomains. `NEXT_PUBLIC_AELI_ROOT_DOMAIN=localhost`
lassen — dann ist jede Seite unter `/p/{handle}` erreichbar, und
`lib/url.ts` erzeugt genau diese Adressen (auch im QR-Code).

```bash
npm run check        # lint + typecheck + tests
npm run db:rls       # Rolle, Policies und Grants prüfen
npm run db:seed:demo # ein Demo-Profil zum Anschauen
```

## Betrieb

- Eigener Service im Railway-Projekt „Aeli.so", **Root Directory `aeli.so`** —
  sonst baut Railway Aera. `railway.toml` liegt daneben.
- Wildcard-DNS `*.aeli.so` und Apex `aeli.so` auf dieselbe Instanz.
- Wildcard-TLS-Zertifikat — sonst ist keine einzige Profilseite erreichbar.
- Port 3001 (`npm start`), damit Aera auf 3000 bleiben kann.
- Variablen: siehe `.env.example`. `AELI_AUTH_SECRET` und `AELI_VISITOR_SALT`
  sind in Produktion Pflicht; ohne sie startet die App nicht.

## Was bewusst fehlt

- **Kein Cookie-Banner.** Die Statistik speichert keine IP, keinen rohen
  User-Agent und kein Cookie — nur einen Hash, der täglich wechselt. Damit
  lässt sich „wie viele verschiedene Leute heute“ beantworten und „ist das
  dieselbe Person wie gestern“ nicht.
- **Keine Webfonts.** Die Themes benutzen Systemschriften. Eine Bio-Seite wird
  meist unterwegs geöffnet; die halbe Sekunde für einen Webfont ist genau die
  halbe Sekunde, in der Leute wieder weg sind.
- **Kein eigenes Impressum.** Aeli und Aera haben denselben Anbieter, also
  dieselben Dokumente. `/legal/*` verweist auf die Originale statt eine zweite
  Fassung zu führen, die auseinanderläuft.
- **Keine 200 Vorlagen.** Acht Presets, die jemand entworfen hat — als
  Ausgangspunkt, nicht als Auswahl. Danach sind Farbe, Form, Schrift, Stimmung
  und Hintergrund einzeln verstellbar, inklusive selbstgebauter Verläufe und
  eigener Hintergrundbilder.
- **Keine Vorschaubilder als Bilddateien.** Die Kacheln im Design-Bereich
  rendern dieselben aufgelösten Themewerte wie die echte Seite
  (`components/studio/theme-thumbnail.tsx`). Ein Screenshot wäre in dem Moment
  veraltet, in dem sich das Produkt ändert.
