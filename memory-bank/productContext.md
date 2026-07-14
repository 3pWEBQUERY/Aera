# Product Context — Aera

## Warum es Aera gibt

Creator sind heute abhängig von fremden Plattformen: Reichweite ist geliehen,
Algorithmen stehen zwischen ihnen und ihren Fans, und ihr Business ist über viele
Einzel-Tools verteilt (Community-App + Kursplattform + Mailtool + Shop + Chat).
Wechselt eine Plattform ihre Regeln, verliert der Creator Zugang, Daten oder Umsatz.

**Aera dreht das um:** Der Creator besitzt seine Community, seine Adresse, seine Marke
und seine Daten. Aera ist die Infrastruktur im Hintergrund — nicht die Bühne, die sich
in den Vordergrund drängt.

## Welche Probleme Aera löst

- **Tool-Salat** → Eine Plattform mit einem Login, einem Checkout, einem Dashboard.
- **Geliehene Reichweite** → Eigene Marke, eigene Adresse, direkter Draht zu Mitgliedern.
- **Verstreute Monetarisierung** → Vier Umsatzwege über einen Checkout: Mitgliedschaften,
  digitale Produkte, bezahlte Bereiche/Kurse, Events.
- **Lock-in** → Vollständiger Datenexport jederzeit.

## Wie es funktionieren soll (User Journeys)

### Creator
1. Konto erstellen (`/signup`) → Community anlegen (`/start`, Onboarding).
2. Im Dashboard (`/dashboard/[slug]`) Bereiche (Spaces) einrichten, Branding & Layout
   setzen, Mitgliedschaften (Tiers) und Produkte anlegen.
3. Inhalte veröffentlichen, Mitglieder einladen & verwalten, Newsletter versenden.
4. Monetarisieren, sobald bereit — Auszahlungen laufen über Stripe Connect.
5. KI-Assistent hilft bei Texten/Ideen; Gamification hält Mitglieder aktiv.

### Mitglied
1. Community entdecken (`/home`, „Entdecken") oder direkt über die Community-Adresse.
2. Beitreten (`/c/[slug]/join`), ggf. kostenpflichtige Mitgliedschaft wählen.
3. Teilnehmen: Beiträge, Kommentare, Reaktionen, Kurse, Events, Chat/DMs, Live,
   Mediathek; Punkte/Level/Abzeichen/Bestenliste als Motivation.

## UX-Prinzipien

- **Editorial/Magazin-Ästhetik** auf Marketing-Seiten (Serifen-Display, warme
  Sandtöne `#f4f1ea`, dunkle Sektionen `#0f0f0d`, große Typo, ruhige Reveals).
- **Kundenfreundliche Sprache** in allen kundenseitigen Texten — **keine
  Programmierer-Fachsprache** (kein „Tenant", „Row Level Security", „Entitlements",
  „Webhook", „JSON-Export"). Stattdessen: „sauber getrennt & geschützt", „schaltet
  sich automatisch frei", „Daten herunterladen".
- **Community-Seiten** übernehmen die Marke des Creators (Primär-/Akzentfarbe via
  CSS-Variablen `--brand`), Aera tritt zurück.
