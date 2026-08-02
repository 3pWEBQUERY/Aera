# Apple In-App-Käufe einrichten

Was auf iOS an Stelle von Stripe passiert, wer was schon kann und was in
App Store Connect noch anzulegen ist.

## Wie es funktioniert

Auf der Website zahlt der Nutzer über Stripe. In der iOS-App verlangt Apple
(Guideline 3.1.1), dass digitale Inhalte über In-App-Käufe laufen — Stripe wäre
dort ein Ablehnungsgrund. Der Weg ist deshalb:

```
iOS: StoreKit-2-Kauf
  └─ JWS-signierte Transaktion
       └─ POST /api/mobile/v1/iap/validate   (Bearer)
            ├─ Signaturkette gegen Apple Root CA – G3 geprüft (lib/apple-iap.ts)
            ├─ bundleId == APPLE_BUNDLE_ID
            ├─ Produkt-Mapping geprüft (lib/apple-products.ts)
            └─ Membership / Entitlement / Order — derselbe Pfad wie der Stripe-Webhook
       └─ erst danach transaction.finish()

Apple später von sich aus (Verlängerung, Kündigung, Erstattung):
  POST /api/mobile/v1/iap/apple-notifications   (kein Bearer, {signedPayload})
```

Wichtig: Die Validierung braucht **keinen** App-Store-Server-API-Schlüssel und
kein Shared Secret. Der Server prüft die Signatur selbst gegen die eingebettete
Apple-Root-CA. Es gibt also nichts zu rotieren.

Beides — App und Server — ist fertig gebaut. Offen ist ausschliesslich die
Konfiguration.

## 1. Server: zwei Umgebungsvariablen

`APPLE_BUNDLE_ID` war nirgends gesetzt. Ohne sie antwortet jede Validierung mit
`iap_invalid` („APPLE_BUNDLE_ID is not configured") — kein Kauf käme an.

| Variable | Wert | Wo |
|---|---|---|
| `APPLE_BUNDLE_ID` | `so.aera.app` | Railway **und** lokal |
| `APPLE_IAP_ALLOW_SANDBOX` | `1` in Entwicklung/TestFlight, leer in Produktion | Railway **und** lokal |

Lokal in `.env` und in `.env.example` sind beide bereits eingetragen. **In
Railway musst du sie noch setzen.**

`APPLE_IAP_ALLOW_SANDBOX` entscheidet, ob Sandbox-Transaktionen gelten. Solange
du über TestFlight testest, muss sie auf `1` stehen — TestFlight-Käufe sind
Sandbox-Käufe. Zum echten Start auf leer setzen, sonst könnte jemand mit einem
Sandbox-Konto Inhalte freischalten.

## 2. App Store Connect: Verträge zuerst

Der häufigste Stolperstein: **Ohne aktiven „Paid Apps"-Vertrag liefert StoreKit
gar keine Produkte aus** — die App zeigt dann leere Preise und der Kauf-Knopf
tut nichts. Das sieht wie ein Bug aus, ist aber nur der fehlende Vertrag.

Unter *Business* → *Agreements, Tax, and Banking*:

1. „Paid Applications"-Vertrag annehmen
2. Bankverbindung hinterlegen
3. Steuerformulare ausfüllen (für die Schweiz: W-8BEN-E für die USA)

Status muss auf *Active* stehen. Das kann ein paar Tage dauern — deshalb zuerst.

## 3. App anlegen

*Apps* → *+* → Bundle-ID `so.aera.app`. Die Bundle-ID muss vorher im
Developer-Portal unter *Identifiers* existieren, mit der Capability
**In-App Purchase**.

## 4. Die 71 Produkte anlegen

Die Produkt-IDs sind keine freie Wahl — der Server leitet aus ihnen den Preis
ab (`aera.unlock.999` = 9,99). Sie müssen **exakt** so heissen. Quelle der
Wahrheit ist `Aera/Aera.storekit` bzw. `lib/apple-products.ts` im Web-Projekt.

Für jedes Produkt brauchst du: Produkt-ID, Referenzname, Preis, einen
Anzeigenamen und eine Beschreibung pro Sprache (mindestens Deutsch), plus ein
Screenshot für die Prüfung — der reicht **einmal** pro Kauf-Art, nicht pro
Produkt.

### Verbrauchbare Artikel (Consumable) — 37 Stück

| Produkt-ID | Referenzname | Preis |
|---|---|---|
| `aera.unlock.99` | Freischaltung 0,99 € | 0,99 € |
| `aera.unlock.199` | Freischaltung 1,99 € | 1,99 € |
| `aera.unlock.299` | Freischaltung 2,99 € | 2,99 € |
| `aera.unlock.399` | Freischaltung 3,99 € | 3,99 € |
| `aera.unlock.499` | Freischaltung 4,99 € | 4,99 € |
| `aera.unlock.599` | Freischaltung 5,99 € | 5,99 € |
| `aera.unlock.699` | Freischaltung 6,99 € | 6,99 € |
| `aera.unlock.799` | Freischaltung 7,99 € | 7,99 € |
| `aera.unlock.899` | Freischaltung 8,99 € | 8,99 € |
| `aera.unlock.999` | Freischaltung 9,99 € | 9,99 € |
| `aera.unlock.1199` | Freischaltung 11,99 € | 11,99 € |
| `aera.unlock.1299` | Freischaltung 12,99 € | 12,99 € |
| `aera.unlock.1499` | Freischaltung 14,99 € | 14,99 € |
| `aera.unlock.1799` | Freischaltung 17,99 € | 17,99 € |
| `aera.unlock.1999` | Freischaltung 19,99 € | 19,99 € |
| `aera.unlock.2499` | Freischaltung 24,99 € | 24,99 € |
| `aera.unlock.2999` | Freischaltung 29,99 € | 29,99 € |
| `aera.unlock.3499` | Freischaltung 34,99 € | 34,99 € |
| `aera.unlock.3999` | Freischaltung 39,99 € | 39,99 € |
| `aera.unlock.4999` | Freischaltung 49,99 € | 49,99 € |
| `aera.unlock.5999` | Freischaltung 59,99 € | 59,99 € |
| `aera.unlock.6999` | Freischaltung 69,99 € | 69,99 € |
| `aera.unlock.7999` | Freischaltung 79,99 € | 79,99 € |
| `aera.unlock.8999` | Freischaltung 89,99 € | 89,99 € |
| `aera.unlock.9999` | Freischaltung 99,99 € | 99,99 € |
| `aera.unlock.14999` | Freischaltung 149,99 € | 149,99 € |
| `aera.unlock.19999` | Freischaltung 199,99 € | 199,99 € |
| `aera.unlock.24999` | Freischaltung 249,99 € | 249,99 € |
| `aera.unlock.49999` | Freischaltung 499,99 € | 499,99 € |
| `aera.unlock.99999` | Freischaltung 999,99 € | 999,99 € |
| `aera.tip.99` | Trinkgeld 0,99 € | 0,99 € |
| `aera.tip.299` | Trinkgeld 2,99 € | 2,99 € |
| `aera.tip.499` | Trinkgeld 4,99 € | 4,99 € |
| `aera.tip.999` | Trinkgeld 9,99 € | 9,99 € |
| `aera.tip.1999` | Trinkgeld 19,99 € | 19,99 € |
| `aera.tip.4999` | Trinkgeld 49,99 € | 49,99 € |
| `aera.tip.9999` | Trinkgeld 99,99 € | 99,99 € |

### Automatisch erneuerbare Abos — Gruppe „Aera Mitgliedschaften" — 34 Stück

| Produkt-ID | Referenzname | Preis | Laufzeit |
|---|---|---|---|
| `aera.sub.month.299` | Mitgliedschaft 2,99 €/Monat | 2,99 € | 1 Monat |
| `aera.sub.month.499` | Mitgliedschaft 4,99 €/Monat | 4,99 € | 1 Monat |
| `aera.sub.month.699` | Mitgliedschaft 6,99 €/Monat | 6,99 € | 1 Monat |
| `aera.sub.month.799` | Mitgliedschaft 7,99 €/Monat | 7,99 € | 1 Monat |
| `aera.sub.month.999` | Mitgliedschaft 9,99 €/Monat | 9,99 € | 1 Monat |
| `aera.sub.month.1299` | Mitgliedschaft 12,99 €/Monat | 12,99 € | 1 Monat |
| `aera.sub.month.1499` | Mitgliedschaft 14,99 €/Monat | 14,99 € | 1 Monat |
| `aera.sub.month.1999` | Mitgliedschaft 19,99 €/Monat | 19,99 € | 1 Monat |
| `aera.sub.month.2499` | Mitgliedschaft 24,99 €/Monat | 24,99 € | 1 Monat |
| `aera.sub.month.2999` | Mitgliedschaft 29,99 €/Monat | 29,99 € | 1 Monat |
| `aera.sub.month.3999` | Mitgliedschaft 39,99 €/Monat | 39,99 € | 1 Monat |
| `aera.sub.month.4999` | Mitgliedschaft 49,99 €/Monat | 49,99 € | 1 Monat |
| `aera.sub.month.5999` | Mitgliedschaft 59,99 €/Monat | 59,99 € | 1 Monat |
| `aera.sub.month.7999` | Mitgliedschaft 79,99 €/Monat | 79,99 € | 1 Monat |
| `aera.sub.month.9999` | Mitgliedschaft 99,99 €/Monat | 99,99 € | 1 Monat |
| `aera.sub.month.14999` | Mitgliedschaft 149,99 €/Monat | 149,99 € | 1 Monat |
| `aera.sub.month.19999` | Mitgliedschaft 199,99 €/Monat | 199,99 € | 1 Monat |
| `aera.sub.year.299` | Mitgliedschaft 2,99 €/Jahr | 2,99 € | 1 Jahr |
| `aera.sub.year.499` | Mitgliedschaft 4,99 €/Jahr | 4,99 € | 1 Jahr |
| `aera.sub.year.699` | Mitgliedschaft 6,99 €/Jahr | 6,99 € | 1 Jahr |
| `aera.sub.year.799` | Mitgliedschaft 7,99 €/Jahr | 7,99 € | 1 Jahr |
| `aera.sub.year.999` | Mitgliedschaft 9,99 €/Jahr | 9,99 € | 1 Jahr |
| `aera.sub.year.1299` | Mitgliedschaft 12,99 €/Jahr | 12,99 € | 1 Jahr |
| `aera.sub.year.1499` | Mitgliedschaft 14,99 €/Jahr | 14,99 € | 1 Jahr |
| `aera.sub.year.1999` | Mitgliedschaft 19,99 €/Jahr | 19,99 € | 1 Jahr |
| `aera.sub.year.2499` | Mitgliedschaft 24,99 €/Jahr | 24,99 € | 1 Jahr |
| `aera.sub.year.2999` | Mitgliedschaft 29,99 €/Jahr | 29,99 € | 1 Jahr |
| `aera.sub.year.3999` | Mitgliedschaft 39,99 €/Jahr | 39,99 € | 1 Jahr |
| `aera.sub.year.4999` | Mitgliedschaft 49,99 €/Jahr | 49,99 € | 1 Jahr |
| `aera.sub.year.5999` | Mitgliedschaft 59,99 €/Jahr | 59,99 € | 1 Jahr |
| `aera.sub.year.7999` | Mitgliedschaft 79,99 €/Jahr | 79,99 € | 1 Jahr |
| `aera.sub.year.9999` | Mitgliedschaft 99,99 €/Jahr | 99,99 € | 1 Jahr |
| `aera.sub.year.14999` | Mitgliedschaft 149,99 €/Jahr | 149,99 € | 1 Jahr |
| `aera.sub.year.19999` | Mitgliedschaft 199,99 €/Jahr | 199,99 € | 1 Jahr |

Die Preise sind Apple-Preispunkte. Du wählst pro Produkt den Punkt, der dem
Euro-Betrag entspricht; die Beträge in anderen Währungen (CHF, USD …) rechnet
Apple selbst und zeigt sie in der App an — `Product.displayPrice` übernimmt das.

## 5. Abo-Gruppe — hier ist eine Entscheidung zu treffen

Alle 34 Abos liegen laut `Aera.storekit` in **einer** Gruppe („Aera
Mitgliedschaften"). Apple behandelt Abos derselben Gruppe als sich gegenseitig
ausschliessend: **ein Kunde kann pro Gruppe nur genau ein Abo gleichzeitig
haben.** Ein zweites ersetzt das erste.

Für eine Creator-Plattform heisst das konkret: Ein Nutzer könnte auf iOS
**Mitglied in genau einer bezahlten Community sein** — im Web über Stripe in
beliebig vielen. Dazu kommt: Zwei Communities mit demselben Preis teilen sich
dieselbe Produkt-ID (`aera.sub.month.999`), und dieselbe Produkt-ID kann ein
Apple-Konto ohnehin nur einmal halten.

Drei Wege:

1. **So lassen.** Eine bezahlte Mitgliedschaft je Nutzer auf iOS. Einfach,
   aber eine spürbare Einschränkung gegenüber dem Web.
2. **Eine Gruppe je Preispunkt** (17 Gruppen à Monat/Jahr). Ein Nutzer kann
   dann mehrere Mitgliedschaften halten — aber keine zwei zum selben Preis.
3. **Produkt-ID je Tier.** `MembershipTier.appleProductId` gibt es bereits als
   Spalte und hat im Mapping Vorrang. Sauber und ohne Einschränkung, aber jedes
   bezahlte Tier eines Creators braucht ein eigenes Produkt in App Store
   Connect — praktisch nur automatisiert über die App-Store-Connect-API, und
   jedes neue Produkt muss durch Apples Prüfung.

Diese Entscheidung gehört **vor** das Anlegen der Abos — Produkte lassen sich
später nicht in eine andere Gruppe verschieben.

## 6. App Store Server Notifications

*App Information* → *App Store Server Notifications*, Version **V2**:

| Umgebung | URL |
|---|---|
| Production | `https://aera.so/api/mobile/v1/iap/apple-notifications` |
| Sandbox | `https://aera.so/api/mobile/v1/iap/apple-notifications` |

Verarbeitet werden `DID_RENEW`, `EXPIRED`, `DID_CHANGE_RENEWAL_STATUS`,
`REFUND` und `GRACE_PERIOD_EXPIRED` — das Gegenstück zu
`customer.subscription.updated` und `charge.refunded` im Stripe-Webhook.
Unbekannte Typen quittiert der Server mit 200, damit Apple nicht endlos
wiederholt.

Ohne diesen Haken merkt der Server nicht, wenn ein Abo verlängert, gekündigt
oder erstattet wird.

## 7. Testen — drei Stufen

**Stufe 1 — ohne App Store Connect, sofort.** Das Schema `Aera` hat
`Aera/Aera.storekit` als StoreKit-Konfiguration hinterlegt. Läufe aus Xcode
kaufen gegen diese lokale Datei, ohne Apple-Konto und ohne echtes Geld. Gut, um
die App-Seite zu prüfen. Der Server muss dafür `APPLE_IAP_ALLOW_SANDBOX=1`
haben.

**Stufe 2 — Sandbox.** *Users and Access* → *Sandbox* → Tester anlegen (eine
E-Mail-Adresse, die noch nie eine Apple-ID war). Auf dem Gerät unter
*Einstellungen → Entwickler → Sandbox-Konto* anmelden. Käufe laufen dann gegen
Apples Sandbox; Abos laufen beschleunigt ab (1 Monat = 5 Minuten), so lässt
sich die Verlängerung wirklich beobachten.

**Stufe 3 — TestFlight.** Ebenfalls Sandbox, aber näher am Ernstfall. Erst hier
zeigt sich, ob Verträge, Produkt-Freigaben und Notifications zusammenspielen.

## Woran es typischerweise scheitert

| Symptom | Ursache |
|---|---|
| Kein Preis, Kauf-Knopf ohne Wirkung | „Paid Apps"-Vertrag nicht aktiv, oder Produkt-ID stimmt nicht exakt |
| Kauf geht durch, Inhalt bleibt gesperrt | `APPLE_BUNDLE_ID` fehlt oder falsch → `iap_invalid` |
| Nur in TestFlight: Kauf wird abgelehnt | `APPLE_IAP_ALLOW_SANDBOX` nicht gesetzt |
| Abo läuft ab, App merkt es nicht | Notification-URL nicht hinterlegt |
| „Dieser Kauf ist nur auf der Website verfügbar" | Preis liegt nicht auf einem erlaubten Preispunkt, oder Produkt ist PHYSICAL (so gewollt) |

Bestandspreise auf erlaubte Preispunkte ziehen:

```
npm run db:snap-prices -- --apply
```

Ohne `--apply` nur eine Vorschau. PHYSICAL-Produkte bleiben unangetastet.
