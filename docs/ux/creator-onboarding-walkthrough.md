# Cognitive Walkthrough: Creator startet seine erste Community

Stand: 16.11.2026 · Methode: Cognitive Walkthrough nach NN/g (Wharton et al.),
Bewertung nach den UI/UX-Behaves (Norman, Nielsen H1–H10, WCAG 2.2 AA).
Durchgeführt von Claude allein auf der laufenden App (lokal, Node 24, Desktop
1280 px und iPhone 13); ersetzt weder die Gruppensitzung noch Tests mit echten
Creatorn.

## Vorbereitung

**Nutzergruppe (aus Belegen, Annahmen markiert):** Creator, die ihre
Community/Mitgliedschaften unter eigener Marke betreiben wollen (README,
Landingpage „Deine Leute. Deine Marke. Dein Geschäft.“, ToDo.md mit Fan- und
Kurs-Communities). Deutschsprachig, Schweiz (CHF als Plattformwährung).
*Annahme:* kennen Instagram/Patreon/Discord, aber keine Community-Software;
richten Aera allein und oft am Handy ein; werden zwischendurch unterbrochen.
Günstigster Test der Annahme: 5 Creator beim ersten Einrichten beobachten.

**Aufgabe in ihren Worten:** „Ich will meine Community aufmachen und den ersten
Beitrag posten.“

**Korrekte Schrittfolge (aus Code und App abgeleitet):**

1. Startseite: „Community kostenlos starten“ (Alternative: „Community starten“ oben rechts)
2. Registrierung ausfüllen, AGB bestätigen, „Konto erstellen“
3. Wizard 1 „Grundlagen“: Namen eingeben, „Weiter“
4. Wizard 2 „Branding“: Farben/Beschreibung, „Weiter“
5. Wizard 3 „Spaces“: Bereiche wählen, „Weiter“
6. Wizard 4 „Mitgliedschaft“: Zugang wählen, „Weiter“
7. Wizard 5 „Übersicht“: prüfen, „Community erstellen“
8. Dashboard: Weg zum ersten Beitrag finden
9. „Beitrag erstellen“, Text schreiben, veröffentlichen
10. „Community ansehen“: öffentliche Seite prüfen

**Version:** laufende App, Stand `main` nach PR #4.

## Aufzeichnungsbögen (vor den Korrekturen)

| Schritt | Q1 richtig | Q2 bemerkt | Q3 verbunden | Q4 Fortschritt | Ergebnis |
|---|---|---|---|---|---|
| 1 Startseite → CTA | Ja – Ziel ist „Community starten“ | Ja – zwei CTAs above the fold | Ja – „Community kostenlos starten“ | Ja – Seite „Für Creator: Erst das Konto, dann deine Community“ | PASS |
| 2 Registrierung | Ja | Ja | Ja – Verb + Nomen „Konto erstellen“ | Ja – „Konto wird erstellt…“, dann Wizard | PASS |
| 3 Wizard Grundlagen | Ja | Ja | Ja | **Nein** – ohne Namen bleibt „Weiter“ deaktiviert, ohne Grund (H1, H9) | FAIL (Q4) |
| 4 Wizard Branding | Ja | Ja | **Nein** – zweite Beschreibung neben „Kurzbeschreibung“ aus Schritt 1; Vorschau zeigt Adresse `aera.so/<slug>`, die es nicht gibt (H2, H4) | Ja – Vorschau ändert sich live | FAIL (Q3) |
| 5 Wizard Bereiche | Ja | Ja – Karten mit Häkchen | **Nein** – Wizard sagt „Bereiche“, Dashboard überall „Spaces“ (H4) | Ja | FAIL (Q3) |
| 6 Wizard Mitgliedschaft | Ja | Ja | Ja | **Nein** – „Weiter“ legt die Community sofort an; Übersicht und Promo-Code werden übersprungen (Feedback/Mapping, H3, H5) | FAIL (Q4) |
| 7 Wizard Übersicht | Ja | Ja | Ja – „Community erstellen“ | Ja – Weiterleitung ins Dashboard (beurteilt, als hätte Schritt 6 funktioniert) | PASS |
| 8 Dashboard → erster Beitrag | Ja – will Inhalte anlegen | **Nein** – kein Hinweis auf den nächsten Schritt; oben Upsell „Auf Starter upgraden“; „Ankündigungen“ steckt zwischen 20 Menüpunkten (Signifier, H6, H8) | **Nein** – „Willkommen zurück“ für eine Erstnutzerin; Gruppenname „Spaces“ statt „Bereiche“ (H2) | Ja – Klick öffnet die Space-Seite | FAIL (Q2, Q3) |
| 9 Beitrag erstellen | Ja | Ja – „Beitrag erstellen“ sichtbar | **Nein** – darüber „+ Ankündigung“ der Banner-Verwaltung im Space „Ankündigungen“ (Mapping, H4) | Ja – Beitrag erscheint sofort in der Liste | FAIL (Q3) |
| 10 Community ansehen | Ja | Ja – „Community ansehen“ im Kopf | Ja | Ja – Seite öffnet sich; leerer Zustand spricht allerdings Mitglieder an | PASS |

**Zusammenfassung:** 4 von 10 Schritten bestanden. Gescheitert sind Q4 in
Schritt 3 und 6, Q3 in Schritt 4, 5, 8 und 9 sowie Q2 in Schritt 8.

## Befunde

| # | Schwere | Prinzip | Ort | Befund | Korrektur (umgesetzt) |
|---|---|---|---|---|---|
| 1 | **Hoch** | Feedback / Mapping, H3, H5 | Wizard Schritt 4 | „Weiter“ wird im selben Klick zum Submit-Button; Community entsteht ohne Übersicht, Promo-Code geht verloren | `onSubmit`-Wächter nur im letzten Schritt, getrennte `key`s für beide Buttons |
| 2 | **Hoch** | Signifier, H6, H8 | Dashboard-Übersicht | Kein nächster Schritt für Erstnutzer; Upsell ist das prominenteste Element | Karte „Erste Schritte“ (Beitrag, Branding, Mitglieder) aus echten Daten, abhakbar, verschwindet wenn erledigt; steht vor dem Paket-Hinweis |
| 3 | Hoch | H3, H5 | Space-Seite, „Löschen“ | Beitrag wird mit einem Klick unwiderruflich gelöscht | Rückfrage nennt Objekt und Folge, Fokus auf „Abbrechen“ |
| 4 | Mittel | H1, H9, Form-Behave | Wizard Schritt 1 und 3 | Deaktivierter „Weiter“-Button ohne Grund | Button bleibt aktiv; Fehlermeldung am Feld (`role=alert`, `aria-invalid`), Fokus auf das Feld |
| 5 | Mittel | Mapping, H4 | Space „Ankündigungen“ | Banner-Verwaltung mit „+ Ankündigung“ über den Beiträgen | Beiträge zuerst, Banner darunter, Button heißt „Banner anlegen“ |
| 6 | Mittel | H2, H4 | Wizard Schritt 2 | Vorschau-Adresse `aera.so/<slug>` existiert nicht; zwei Beschreibungsfelder | Vorschau zeigt `<slug>.<domain>`; Schritt 1 heißt „Slogan (optional)“ mit passendem Platzhalter |
| 7 | Mittel | H2 | Wizard vs. Dashboard | „Bereiche“ vs. „Spaces“ | Wizard verwendet „Spaces“ und erklärt einmal, was ein Space ist |
| 8 | Mittel | H2 | Dashboard-Übersicht | „Willkommen zurück“ für neue Creator; „— · Owner“ ohne Stufe | Eigene Begrüßung für neue Communities; Strich entfällt |
| 9 | Mittel | Signifier | Übersicht, Planer-Widget | „Anstehende Pläne“ neben „Dein Paket“; Free-Nutzer landen nach „Ersten Plan anlegen“ auf gesperrter Seite | Widget nur mit Planer im Paket, heißt „Geplante Inhalte“ |
| 10 | Mittel | H2 | Öffentliche Seite | Leerer Zustand sagt der Inhaberin „Sei die erste Person … geh in einen Space“ | Eigener Text und „Ersten Beitrag schreiben“ für Staff |
| 11 | Mittel | Responsive | Dashboard am Handy | Community-Leiste belegt dauerhaft ~20 % der Breite | Leiste ab `sm`; im Menü „Alle Communities“ |
| 12 | Mittel | WCAG 1.4.3 | ganze App | Sekundärtext `slate-400` (2,6:1), Wizard-Schritte (1,9:1), Rot auf Beige (4,2:1) | `slate-500`, Tinte ≥ 65 %, `red-700`; axe ohne serious/critical auf allen geprüften Seiten |
| 13 | Mittel | WCAG 4.1.2 | Space- und Mitgliederkarten | `role="button"`-Karte enthält weitere Buttons (nested-interactive) | Karte per Maus klickbar, echter Button auf dem Namen |
| 14 | Niedrig | Signifier | Buttons | Der blasse Aktions-Button gleicht einem deaktivierten | Deaktiviert ist jetzt neutral grau |
| 15 | Niedrig | H8 | Wizard | „Abbrechen“ und „Schritt x/5“ doppelt | Je einmal |

**Offen, zur Entscheidung:** Die Aktionsfarbe (`--action: #d8cfef`) ist
bewusst zurückhaltend. Eine kräftigere Primärfarbe würde den Haupt-Button auf
jeder Seite eindeutiger machen (Signifier) – das ist eine Markenentscheidung.
Ebenso die Zahl gesperrter Menüpunkte (9 von ~22 für Free): sie könnten unter
„Mehr mit Starter“ gebündelt werden.

## Akzeptanzkriterien

1. Gegeben Wizard-Schritt 4, wenn „Weiter“ geklickt wird, dann erscheint die Übersicht „Alles bereit?“ und es existiert noch keine Community.
2. Gegeben Wizard-Schritt 1 ohne Namen, wenn „Weiter“ geklickt wird, dann steht unter dem Feld „Gib deiner Community einen Namen …“ und der Fokus liegt im Namensfeld; ein Screenreader liest die Meldung vor.
3. Gegeben eine neue Community, wenn das Dashboard öffnet, dann steht „Erste Schritte“ vor dem Paket-Hinweis und „Beitrag schreiben“ führt in einen Space mit „Beitrag erstellen“.
4. Gegeben ein veröffentlichter Beitrag, dann zeigt „Erste Schritte“ „1 von 3 erledigt“ und den Beitrag abgehakt.
5. Gegeben ein Beitrag, wenn „Löschen“ geklickt wird, dann fragt die Seite „Beitrag endgültig löschen?“, der Fokus liegt auf „Abbrechen“ und erst „Endgültig löschen“ entfernt ihn.
6. Mit der Tastatur allein lassen sich Space- und Mitgliederkarten öffnen, ohne dass ein Bedienelement in einem anderen steckt.
7. Bei 375 px Breite gibt es im Dashboard keinen horizontalen Scroll, und „Alle Communities“ ist über das Menü erreichbar.
8. axe meldet auf Startseite, Login, Registrierung, Preisen, Hilfe, Wizard, Dashboard-Übersicht, Spaces, Mitglieder, Einstellungen, Mitgliedschaften und Community-Startseite nichts „serious“ oder „critical“.

Automatisiert in `e2e/creator-onboarding.spec.ts` (Kriterien 1–5, 8 für die
Übersicht) und `e2e/accessibility.spec.ts`.

**Nächster Schritt:** Gruppensitzung mit Produkt/Entwicklung und ein Test mit
3–5 echten Creatorn, die Aera noch nie gesehen haben (Aufgabe wie oben, laut
denken). Danach den Walkthrough erneut durchgehen.
