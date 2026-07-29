# Live-Streaming über Aera einrichten (Cloudflare Stream)

Creator gehen **direkt im Browser** live — Kamera oder Bildschirm, ein Klick,
keine Zusatzsoftware. Wer Szenen, Overlays und eine Aufzeichnung braucht, kann
stattdessen OBS nehmen. Technisch läuft beides über **Cloudflare Stream Live**:
pro Live-Session legt Aera einen „Live Input" an.

## Die zwei Wege im Vergleich

| | **Im Browser** (Standard) | **Mit OBS** |
|---|---|---|
| Software | keine | OBS o. ä. |
| Übertragung | WebRTC (WHIP) | RTMPS |
| Verzögerung | unter 1 Sekunde | 5–20 Sekunden |
| Wiedergabe | WebRTC (WHEP) | HLS |
| Aufzeichnung | **nein** | ja, automatisch |
| Szenen, Overlays | nein | ja |
| Geschützte Streams | Adresse wird nur an Berechtigte ausgeliefert | signierte Adressen, 2 Std. gültig |

Die fehlende Aufzeichnung beim Browser-Weg ist keine Entscheidung von Aera —
Cloudflare zeichnet WebRTC-Eingänge (Stand der Beta) nicht auf. Für ein
Q&A oder eine spontane Runde ist das meist egal; für einen Vortrag, den du
später verkaufen willst, nimm OBS.

Ohne die drei Umgebungsvariablen unten bleibt alles beim Alten — beide eigenen
Wege sind im Quellen-Schalter dann ausgegraut, externe Plattformen
funktionieren wie bisher.

## 1. Stream im Cloudflare-Konto aktivieren

1. <https://dash.cloudflare.com> → linke Leiste → **Stream**.
2. Beim ersten Aufruf das Abonnement bestätigen. Abgerechnet wird nach
   Verbrauch: **1 $ je 1.000 ausgelieferte Minuten** und **5 $ je 1.000
   gespeicherte Minuten**. Ingest und Transcoding sind kostenlos.
3. Optional, aber empfohlen: unter **Stream → Settings** ein Ausgabelimit
   setzen, damit ein einzelner viraler Stream nicht unbegrenzt abrechnet.

## 2. Die drei Werte heraussuchen

| Variable | Wo | Aussehen |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Dashboard → rechte Spalte „Account ID", oder aus der URL nach `/accounts/` | 32 Zeichen hex |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE` | Stream → ein beliebiges Video → Embed-Code. In `customer-XXXX.cloudflarestream.com` ist `XXXX` der Code | ca. 16–32 Zeichen |

Beim Customer-Code darfst du auch die ganze Adresse einsetzen —
`customer-XXXX.cloudflarestream.com` oder `https://customer-XXXX.cloudflarestream.com/…`
werden beim Start auf den Code zurückgeführt.
| `CLOUDFLARE_STREAM_TOKEN` | siehe Schritt 3 | beginnt nicht mit einem festen Präfix |

Hat das Konto noch kein Video, entsteht der Customer-Code nach dem ersten
angelegten Live-Input; alternativ steht er unter **Stream → Settings** bei
„Customer subdomain".

## 3. API-Token anlegen

**My Profile → API Tokens → Create Token → Create Custom Token**

- Name: `aera-stream`
- Permissions: **Account → Stream → Edit** (nur diese eine)
- Account Resources: **Include → dein Konto**
- Client IP Address Filtering: leer lassen (Railway hat keine feste IP)
- TTL: unbegrenzt oder ein Datum, an das du dich erinnerst

Der Token wird **einmal** angezeigt. Kopiere ihn sofort.

Der Token darf ausschließlich `Stream: Edit` können. Ein Global-API-Key hätte
Zugriff auf DNS, Zertifikate und alles andere — der gehört nicht in eine
Anwendung.

## 4. In Railway eintragen

Railway → Projekt → Service → **Variables**:

```
CLOUDFLARE_ACCOUNT_ID=…
CLOUDFLARE_STREAM_TOKEN=…
CLOUDFLARE_STREAM_CUSTOMER_CODE=…
```

Danach neu deployen. Die drei Werte gehören zusammen: fehlt einer, bleibt die
Funktion aus (`features.streamLive`), statt halb zu arbeiten. Die Prüfung in
`lib/env-validation.ts` meldet beim Start, wenn nur ein Teil gesetzt ist.

## 5. Prüfen — Weg „Im Browser"

1. `/dashboard/<community>/spaces/<live-space>` → **Neue Live-Session**.
2. Unter **Stream-Quelle** ist **Im Browser** vorausgewählt. Anlegen.
3. **Verwalten** öffnen. Der Browser fragt nach Kamera und Mikrofon; danach
   läuft die Vorschau.
4. Kamera bzw. **Bildschirm** wählen, Mikrofon wählen, **Live gehen** drücken.
   Nach ein bis zwei Sekunden steht oben **Auf Sendung** mit einer Uhr.
5. In einem zweiten Fenster als Mitglied die Session öffnen — das Bild sollte
   praktisch verzögerungsfrei ankommen.
6. **Beenden** drücken. Die Seite darf während der Sendung nicht geschlossen
   werden; Bild und Ton kommen direkt von diesem Tab.

## 6. Prüfen — Weg „Mit OBS"

1. Neue Session, Quelle **Mit OBS**, anlegen, **Verwalten**.
2. Serveradresse und Streamschlüssel stehen da.
3. In OBS: **Einstellungen → Stream → Dienst „Benutzerdefiniert"**, beides
   einsetzen, **Stream starten**. Nach einigen Sekunden springt das Abzeichen
   im Dashboard auf **Verbunden**.
4. **Live gehen** drücken. Die Session erscheint jetzt bei den Mitgliedern.
5. **Beenden** drücken. Die Aufzeichnung wird übernommen, sobald Cloudflare sie
   fertig hat — sonst später über **Aufzeichnung holen**.

## Was Aera dabei tut

- **Ein Live-Input pro Session.** Die UID steht in `LiveSession.cfInputId`.
  Beim Löschen der Session wird der Input mitgelöscht.
- **Der Streamschlüssel wird nicht gespeichert.** Er wird auf Klick von
  Cloudflare geholt. Wer ihn hat, kann unter dem Namen des Creators senden;
  in der Datenbank wäre er ein Geheimnis mehr, das man schützen, rotieren und
  beim Datenexport ausnehmen müsste.
- **Der Browser sendet direkt zu Cloudflare.** Bild und Ton laufen nicht über
  den Aera-Server; der gibt nur die WHIP-Adresse heraus, und zwar nur an Staff.
  Deshalb kostet das Feature dich keine Bandbreite und skaliert von selbst.
- **Sessions mit Zugangsvoraussetzung sind geschützt.** Beim OBS-Weg wird der
  Input mit `requireSignedURLs` angelegt und der Live-Raum bekommt pro Aufruf
  ein Token mit zwei Stunden Laufzeit — eine kopierte Adresse läuft also ab.
  Beim Browser-Weg gibt Cloudflare (Beta) keine signierten WebRTC-Adressen aus;
  dort liegt der Schutz darin, dass die Wiedergabe-Adresse serverseitig nur an
  Berechtigte ausgeliefert wird. Das ist schwächer: wer sie aus dem Quelltext
  kopiert, kann sie weitergeben, solange gesendet wird. **Für bezahlte Streams
  ist OBS deshalb der sichere Weg.**
- **Aufgezeichnet wird beim OBS-Weg immer.** Die Wiederholung ist der halbe
  Wert eines Livestreams. Löschen kann der Creator sie hinterher.

## Kosten im Blick behalten

Ein 1080p-Stream verbraucht rund **2,25 GB je Zuschauerstunde** — bei
Cloudflare zählt aber die Minute, nicht das Byte:

| Szenario | Ausgelieferte Minuten | Kosten |
|---|---|---|
| 50 Zuschauer, 1 Std | 3.000 | 3 $ |
| 200 Zuschauer, 2 Std | 24.000 | 24 $ |
| 1.000 Zuschauer, 2 Std | 120.000 | 120 $ |

Dazu die Speicherung der Aufzeichnungen: 5 $ je 1.000 Minuten und Monat, also
knapp 0,30 $ im Monat für eine Zwei-Stunden-Aufzeichnung.

Das skaliert linear — du kannst also pro Paket ein Kontingent kalkulieren
(z. B. „2.000 Zuschauerstunden inklusive") und darüber hinaus abrechnen.

## Wenn etwas nicht geht

| Symptom | Ursache |
|---|---|
| Beide eigenen Wege sind ausgegraut | Eine der drei Variablen fehlt oder das Deployment ist noch das alte |
| Log: „Environment validation reported issues" | Die nächste Logzeile nennt die Variable. Häufigster Fall: `CLOUDFLARE_ACCOUNT_ID` ist nicht die 32-stellige Konto-ID |
| „Der Stream konnte nicht eingerichtet werden" | Token hat nicht `Stream: Edit`, oder Stream ist im Konto nicht aktiviert |
| OBS verbindet nicht | Dienst muss „Benutzerdefiniert" sein, nicht Twitch/YouTube. Port 443 ausgehend muss offen sein |
| Bleibt „Wartet auf Signal" | OBS sendet noch nicht, oder der Schlüssel gehört zu einer anderen Session |
| Player bleibt schwarz | Bei geschützten Sessions: Token abgelaufen — Seite neu laden |
| Keine Aufzeichnung (OBS) | Cloudflare braucht nach dem Sendeende ein paar Minuten. Danach **Aufzeichnung holen** |
| Keine Aufzeichnung (Browser) | So vorgesehen — WebRTC-Eingänge zeichnet Cloudflare nicht auf |
| Kamera wird nicht gefragt | Kamera und Mikrofon gibt der Browser nur über HTTPS frei. Lokal `localhost` verwenden, nicht die IP |
| „Die Verbindung kam nicht zustande" | Ein Netz, das UDP blockiert (manche Firmennetze). Über Mobilfunk gegentesten |
