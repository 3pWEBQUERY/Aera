# Aera — Visitor & Member iOS App

Native iOS-App (SwiftUI, iOS 26+, Liquid Glass) für Besucher und Mitglieder von Aera-Communities. Zahlungen laufen **ausschließlich über Apple In-App-Purchases** (StoreKit 2) — kein Stripe in der App. Die Creator-Verwaltung bekommt später eine eigene App.

## Projekt öffnen

Das Xcode-Projekt wird aus `project.yml` generiert ([XcodeGen](https://github.com/yonaskolb/XcodeGen)):

```bash
brew install xcodegen
cd Aera-visitor-member-iOS-App
xcodegen generate
open Aera.xcodeproj
```

Voraussetzungen: Xcode 26+, iOS-26-Simulator. Das Schema `Aera` nutzt automatisch `Aera.storekit` (StoreKit-Testumgebung) — Käufe funktionieren im Simulator ohne App Store Connect.

## Backend

Die App spricht die Mobile-API der Next.js-App (`app/api/mobile/v1/**`, im Hauptprojekt enthalten). Vertrag: [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md).

- Basis-URL: standardmäßig `https://aera.so`, im Debug-Build unter *Konto → Entwickler* umstellbar (z. B. `http://localhost:3000`).
- Neue Env-Variablen im Backend: `APPLE_BUNDLE_ID=so.aera.app`, optional `APPLE_IAP_ALLOW_SANDBOX=1` (Sandbox-Käufe akzeptieren).
- Neue DB-Migration: `apple_iap` (Apple-Produkt-IDs + Transaktions-IDs). Einspielen mit `npm run db:deploy`.

## Apple-Zahlungen (StoreKit 2)

- **Mitgliedschaften** → Auto-Renewable Subscriptions. Produkt-ID pro Tier: Feld `appleProductId` am `MembershipTier`, sonst Preis-Pool `aera.sub.month.<cents>` / `aera.sub.year.<cents>`.
- **Einzelkäufe** (Posts, Medien, digitale Produkte, Requests, Booking) → Konsumierbare aus dem Preis-Pool `aera.unlock.<cents>`; digitale Produkte optional mit eigenem `appleProductId`.
- **Tips** → Konsumierbare `aera.tip.<cents>`.
- **Physische Produkte** werden nie über IAP verkauft (App-Store-Richtlinie 3.1.1) — die App zeigt sie ohne Kaufoption.
- Nach jedem Kauf sendet die App die signierte Transaktion (JWS) an `POST /api/mobile/v1/iap/validate`; der Server verifiziert die Signaturkette gegen die Apple Root CA und schaltet exakt wie der Stripe-Webhook frei. Verlängerungen/Kündigungen/Refunds kommen über App Store Server Notifications V2 (`POST /api/mobile/v1/iap/apple-notifications` — diese URL in App Store Connect eintragen).
- Alle Pool-Produkte stehen in `Aera.storekit` und müssen für den Release identisch in App Store Connect angelegt werden.

## Struktur

```
Aera/
  App/            Entry, Root-TabView, AppState (Session, Router)
  Core/
    Networking/   APIClient, Endpoints, DTOs (1:1 zum API-Vertrag)
    Auth/         SessionStore (Keychain), Login-Flows
    DesignSystem/ Theme (Aera-Tokens), Liquid-Glass-Komponenten
    Purchases/    StoreService (StoreKit 2), IAP-Validierung
  Features/
    Discover/     Entdecken-Tab
    Community/    Community-Shell, Space-Renderer (alle 20 Typen)
    Spaces/       Feed, Forum, Blog, Videos, Podcast, Gallery, Course, Shop,
                  Events, Newsletter, Knowledge, Links, Live, Chat, Requests,
                  Booking, Stories, Tips, Calendar
    Membership/   Join/Paywall, Tier-Auswahl (IAP)
    Member/       Leaderboard, Members, Library, Suche, Notifications
    Account/      Profil, Mitgliedschaften, Bestellungen, Einstellungen
  Localizable.xcstrings   19 Sprachen (Quellsprache Deutsch)
docs/             API-Vertrag & Design-Spec
project.yml       XcodeGen-Definition
Aera.storekit     StoreKit-Testkonfiguration
```

## Design

Übernimmt das Web-Design vollständig (Spec: [`docs/DESIGN.md`](docs/DESIGN.md)): warmes Papier `#F4F1EA`, Tinte `#161613`, Editorial-Serifen (New York), abgerundet-quadratische Avatare, Tenant-Branding über die Community-Primärfarbe — kombiniert mit nativem Liquid Glass (Tab-Bar, Space-Chips, Paywall-Overlays).
