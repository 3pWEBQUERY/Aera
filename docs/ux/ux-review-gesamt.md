# UX-Review der ganzen Anwendung

Stand: 16.11.2026. Ergänzt [`creator-onboarding-walkthrough.md`](creator-onboarding-walkthrough.md).
Methode wie dort: Cognitive Walkthrough (Q1–Q4) pro Aufgabe, Heuristiken H1–H10,
WCAG 2.2 AA mit axe, Desktop 1280 px, iPhone 13 und 375 px. Durchgeführt von
Claude allein auf der laufenden App; ersetzt keine Tests mit echten Creatorn
und Mitgliedern.

## Ergebnis vor den Korrekturen

| Bereich | Aufgaben | Schritte bestanden |
|---|---|---|
| Creator: Inhalte und Geld (Mitgliedschaft, Produkt, Kurs, Event, Medien, Newsletter) | 6 | 11 von 32 |
| Mitglieder (beitreten, Forum, Neues, Konto) | 4 | 12 von 21 |
| Öffentliche Seiten, Anmeldung, Hilfe, Sprache | 6 | 15 von 36 |
| Einstellungen, Layout, Mitglieder, Domain, Export (dazu Heuristik für Admin) | 5 | 13 von 30 |

## Die schwersten Befunde und ihre Korrektur

| Befund | Korrektur |
|---|---|
| Event-Zeit verschob sich bei jedem Speichern um +1 h (Server UTC) | Browser schickt seinen Offset mit, `lib/local-datetime.ts`, Test mit Rundlauf |
| Newsletter ging ohne Rückfrage raus, auch an 0 Empfänger | Rückfrage mit Empfängerzahl; ohne Empfänger kein Senden (auch serverseitig) |
| Bezahlte Spaces verlangten einen frei eingetippten Schlüssel; ein Tippfehler sperrte Zahlende aus | Auswahl der Mitgliedschaft, serverseitig gegen echte Mitgliedschaften geprüft |
| Gesperrte Beiträge verrieten Text (Kacheltitel, Forenliste, Suche, Blog, Empfehlungen, Mobile-Suche) | Gesperrte Beiträge liefern keinen Text mehr; Suche durchsucht nur Freigegebenes |
| Preise in €, gespeichert in CHF | Plattformwährung überall |
| Produkttypen „Kurszugang“, „Tier-Zugang“, „Bundle“ schalteten nichts frei | Kurszugang vergibt den Schlüssel des Kurses; die anderen beiden werden nicht mehr angeboten |
| Jeder Upgrade-Weg öffnete das KI-Credit-Sheet; „Wechseln“ endete mit HTTP 500 | Eigenes Sheet „Paket wechseln“ mit Leistungen aus `lib/plan-features.ts`; Fehler am Button |
| Upload-Fehler auf Englisch, dreifach, und Toasts verdeckten „Beitrag erstellen“ | Eine übersetzte Meldung am Feld mit „Erneut hochladen“; das Dock zeigt nur Fortschritt |
| Preisseite verschwieg die Plattformgebühr; Startseite bewarb Funktionen späterer Pakete als „ohne Aufpreis“ | Gebühr auf Karten, Tabelle und Fußnote; jede Aussage aus dem Code abgeleitet („Ab Starter: …“) |
| Login leerte E-Mail und Passwort beim 2FA-Schritt; keine Wiederherstellungscodes | Eingaben bleiben; 10 Einmal-Codes (gehasht), auch in der Mobile-API |
| Mitglieder konnten weder austreten noch kündigen | „Mitgliedschaft beenden“ / „Abo kündigen“ im Konto, mit ehrlicher Rückfrage |
| Geteilter Link auf einen Mitgliederbeitrag zeigte 404 | Sperrseite mit Beitritt und Rückweg zum Beitrag |
| „Deine Communities“ führte Mitglieder in den Creator-Wizard | Führt zur eigenen Liste; „Creator-Bereich“ nur für Team |
| „Eigene Domain“ wurde verkauft, hatte aber keine Oberfläche | Abschnitt mit Status, Anleitung für Laien und „Domain prüfen“ |
| Sperren steckte im Status-Feld und kündigte still Abos | Eigener Button mit Rückfrage, die die Abo-Kündigung nennt |
| Audit-Log: jeder Eintrag ging verloren (VOID-Rückgabe), Akteur fehlte, Rohschlüssel | `$executeRaw`, Akteur ergänzt, Klartext-Sätze; Test verlangt Text für jeden Schlüssel |
| Admin ohne Navigation unter 768 px | Kopfzeile mit Menü |

Dazu viele mittlere und kleine Befunde: `window.confirm()` überall durch einen
gemeinsamen Dialog ersetzt (`components/ui/confirm-dialog.tsx`, Fokus auf
„Abbrechen“), Labels und `aria-pressed`, Kontraste, Pluralformen, „Tier“ →
„Mitgliedschaft“, Französisch durchgehend „vous“, Sprache nach Browser, kein
horizontaler Scroll bei 375 px.

## Prüfung nach den Korrekturen

- `tsc`, `eslint`, 826 Vitests, `next build`, 12 Playwright-Specs grün.
- axe ohne serious/critical auf allen in den Walkthroughs besuchten Seiten
  (Desktop und 375 px).
- Neue Migration: `20261116120000_totp_recovery_codes`.

## Offen, zur Entscheidung

1. **Moderatoren** haben keinen Zugang zum Dashboard (`dashboard/[slug]/layout.tsx`
   verlangt ADMIN), obwohl die Moderationsseite MODERATOR erlaubt. Soll es
   für Moderatoren eine schmale Moderationsansicht geben?
2. **Ankündigungen**: Mitglieder dürfen in jedem Feed-Space posten. Eine
   Einstellung „Nur das Team postet“ gibt es nur für Chats.
3. **Antwortzeit**: Die Kontaktseite verspricht „im Schnitt innerhalb eines
   Werktags“.
4. **Paid-Gate**: Ein Space „Bezahlt“ ohne bestimmte Mitgliedschaft öffnet sich
   für jeden, der irgendetwas Bezahltes besitzt (auch ein Produkt). Das steht
   jetzt so im Hinweis; ob es so bleiben soll, ist eine Produktfrage.

Nicht live geprüft: echte Uploads (lokaler S3 nicht erreichbar), echter
Stripe-Checkout, echter Mailversand, Screenreader-Durchlauf.
