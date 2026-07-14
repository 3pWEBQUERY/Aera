# Project Brief — Aera

## Was ist Aera?

Aera ist eine **mandantenfähige Creator-Plattform**, auf der jeder Creator seine
**eigene Community** unter der **eigenen Marke** betreibt. Community, Mitgliedschaften,
Verkauf (Commerce), Kurse, Events, Newsletter, Gamification und KI werden in **einer
einzigen Anwendung** vereint — mit einem Login, einem Checkout und einem Dashboard.

Die Kernbotschaft: **„Plattformen leihen dir Reichweite. Aera gehört zu dir."**
Kein Algorithmus zwischen Creator und Mitgliedern, kein Tool-Salat aus separater
Community-App, Kursplattform, Mailtool und Shop.

> Dies ist **kein Prototyp und keine Demo** — es ist eine voll funktionsfähige
> Anwendung mit echter Datenbank, echter Authentifizierung, echter Mandantentrennung
> und echter Geschäftslogik. Es gibt bewusst keine Demo-Inhalte; die erste echte
> Community wird über die Oberfläche unter `/start` angelegt.

## Kern-Anforderungen & Ziele

1. **Mandantentrennung (Multi-Tenancy):** Jede Community ist strikt von allen anderen
   isoliert — im Application-Layer (jede Query auf den aktiven Tenant gescoped) und
   zusätzlich per PostgreSQL Row Level Security als Defense-in-Depth.
2. **Alles unter der Marke des Creators:** Eigenes Logo, eigene Farben, eigenes Layout,
   eigene Internetadresse (Subdomain, Custom Domain vorbereitet).
3. **Vollständiger Funktionsumfang statt Feature-Fragmenten:** 14 Bereichs-Typen
   (Spaces), Memberships, Commerce, Kurse, Events, Newsletter, Chat/DMs, Live,
   Mediathek, Gamification, KI, Mitgliederverwaltung, Entdecken, Datenexport.
4. **Datenhoheit:** Vollständiger Datenexport jederzeit; kein Lock-in.
5. **Progressive Integrationen:** Stripe, Resend und OpenAI sind vollständig
   implementiert und schalten sich frei, sobald der jeweilige Key gesetzt ist. Ohne
   Keys bleibt die App vollständig nutzbar (Free-Tiers, Käufe im Dev als bezahlt
   verbucht, Newsletter protokolliert, KI keyword-basiert).

## Scope-Grenzen

- Drei sauber getrennte Produktbereiche in **einer** Next.js-App:
  **Marketing** (öffentlich), **Creator-Dashboard** (geschützte Verwaltung),
  **Community** (mandantenfähig, `/c/[slug]`).
- Kein separates Backend, keine Microservices — Server Components + Server Actions.

## Zielgruppen

- **Creator** (Owner/Admin/Moderator): betreiben und monetarisieren die Community.
- **Mitglieder**: konsumieren Inhalte, nehmen teil, kaufen, tauschen sich aus.
- **Plattform-Admin**: übergreifende Verwaltung (`/admin`).
