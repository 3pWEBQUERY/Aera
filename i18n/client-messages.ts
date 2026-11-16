import { getMessages } from "next-intl/server";

/**
 * Welche Teile des Übersetzungskatalogs an den Browser gehen.
 *
 * Ohne `messages` gibt `NextIntlClientProvider` den ganzen Katalog weiter
 * (rund 240 KB, inkl. Admin, Dashboard, E-Mails und Seed-Texten) — in jedem
 * HTML-Dokument. Server-Komponenten brauchen das nicht: `getTranslations`
 * liest weiter den vollen Katalog aus `i18n/request.ts`. Der Browser braucht
 * nur die Namespaces, die Client-Komponenten per `useTranslations` nutzen.
 *
 * Die Listen sind bewusst grob (meist ganze Top-Level-Namespaces). Nur
 * `dashboard` (≈ 120 KB) ist ausserhalb des Creator-Bereichs fein aufgeteilt.
 *
 * Verschachtelte Provider ersetzen die Messages (kein Merge). Deshalb
 * enthalten die Bereichs-Listen immer auch die Basis-Liste.
 *
 * Neue Client-Komponente mit neuem Namespace? Dann hier eintragen —
 * `tests/client-messages.test.ts` scannt alle Client-Module und schlägt fehl,
 * wenn ein Namespace fehlt.
 */
export const BASE_CLIENT_NAMESPACES = [
  "account",
  "auth",
  "authPages",
  "categories",
  "common",
  "community",
  "discover",
  "help",
  "language",
  "legalPurchase",
  "legalReview",
  "marketing",
  "nameStatus",
  "onboarding",
  "spaces",
  "support",
  "ui",
  "unsubscribe",
  "uploads",
  "verifyBanner",
  // Aus dem Dashboard-Katalog nur, was Community-Seiten und Live-Studio nutzen.
  "dashboard.live.mobileStudio",
  "dashboard.rte",
] as const;

/** Creator-Dashboard (`app/(creator)/dashboard/[slug]/layout.tsx`). */
export const CREATOR_CLIENT_NAMESPACES = [
  ...BASE_CLIENT_NAMESPACES,
  "dashboard",
  "billingSafety",
  "pricing",
] as const;

/** Plattform-Admin (`app/admin/layout.tsx`). */
export const ADMIN_CLIENT_NAMESPACES = [...BASE_CLIENT_NAMESPACES, "admin"] as const;

type Messages = Record<string, unknown>;

/** Kopiert nur die genannten Namespace-Pfade (`a` oder `a.b.c`) aus `messages`. */
export function pickMessages(messages: Messages, namespaces: readonly string[]): Messages {
  const out: Messages = {};
  // Tiefe Pfade zuerst: So steigt die Schleife nur in selbst angelegte
  // Objekte ab und verändert nie den (gecachten) Original-Katalog.
  const ordered = [...namespaces].sort((a, b) => b.split(".").length - a.split(".").length);
  for (const ns of ordered) {
    const parts = ns.split(".");
    let src: unknown = messages;
    for (const p of parts) {
      src = src && typeof src === "object" ? (src as Messages)[p] : undefined;
    }
    if (src === undefined) continue;
    let dst = out;
    for (const p of parts.slice(0, -1)) {
      const next = dst[p];
      if (next && typeof next === "object") {
        dst = next as Messages;
      } else {
        const created: Messages = {};
        dst[p] = created;
        dst = created;
      }
    }
    // Ein grober Eintrag (`dashboard`) gewinnt über feinere (`dashboard.rte`).
    const leaf = parts[parts.length - 1]!;
    const existing = dst[leaf];
    if (existing === undefined || typeof src !== "object") dst[leaf] = src;
    else dst[leaf] = { ...(existing as Messages), ...(src as Messages) };
  }
  return out;
}

/** Messages für einen `NextIntlClientProvider` in Server-Komponenten. */
export async function clientMessages(namespaces: readonly string[]): Promise<Messages> {
  return pickMessages((await getMessages()) as Messages, namespaces);
}
