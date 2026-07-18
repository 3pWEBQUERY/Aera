// Apple-IAP-Produkt-Mapping (siehe API-CONTRACT.md §Apple).
//
// Reihenfolge der Auflösung:
//  1. Explizit: `MembershipTier.appleProductId` / `Product.appleProductId`.
//  2. Preis-Pool-Fallback für One-Time-Unlocks (Posts, Medien, Media-Items,
//     Requests, Booking UND digitale Shop-Produkte DIGITAL/BUNDLE/
//     COURSE_ACCESS/TIER_GRANT): konsumierbare Produkte `aera.unlock.{cents}`.
//  3. Tips: `aera.tip.{cents}`.
//  4. Abo-Pool: `aera.sub.month.{cents}` / `aera.sub.year.{cents}` — nur wenn
//     kein explizites Mapping existiert.
//  5. PHYSICAL-Produkte: nie IAP (`appleProductId: null`, nur Web-Verkauf).
//
// Die drei Preispunkt-Listen sind die EINZIGE Quelle der Wahrheit für zulässige
// Preise bezahlter Inhalte. Jeder erlaubte Preispunkt entspricht exakt einem
// festen Apple-Preispunkt (StoreKit: Aera.storekit). Bezahlte Inhalte dürfen
// ausschließlich diese Cent-Beträge verwenden — serverseitig erzwungen.
//
// Bewusst ohne "server-only": reine Mapping-Logik, auch in Tests und im
// Client (Preis-Auswahllisten) nutzbar.

import type { BillingInterval, ProductType } from "@/app/generated/prisma/client";
import { formatPrice } from "@/lib/utils";

/**
 * One-Time-Unlock-Pool (Cents) — gilt für PPV-Posts, Medien-Pakete/-Items,
 * Requests, Booking-Slots UND digitale Shop-Produkte. Feste Apple-Preispunkte.
 */
export const ONE_TIME_PRICE_POINTS = [
  99, 199, 299, 399, 499, 599, 699, 799, 899, 999, 1199, 1299, 1499, 1799,
  1999, 2499, 2999, 3499, 3999, 4999, 5999, 6999, 7999, 8999, 9999, 14999,
  19999, 24999, 49999, 99999,
] as const;

/** Abo-Pool (Cents) — Tier-Abos monatlich & jährlich. Feste Apple-Preispunkte. */
export const SUBSCRIPTION_PRICE_POINTS = [
  299, 499, 699, 799, 999, 1299, 1499, 1999, 2499, 2999, 3999, 4999, 5999,
  7999, 9999, 14999, 19999,
] as const;

/** Trinkgeld-Pool (Cents). Feste Apple-Preispunkte. */
export const TIP_PRICE_POINTS = [99, 299, 499, 999, 1999, 4999, 9999] as const;

const ONE_TIME_SET = new Set<number>(ONE_TIME_PRICE_POINTS);
const SUB_SET = new Set<number>(SUBSCRIPTION_PRICE_POINTS);
const TIP_SET = new Set<number>(TIP_PRICE_POINTS);

/** Ist `cents` ein zulässiger One-Time-Preispunkt? */
export function isAllowedOneTimePriceCents(cents: number): boolean {
  return ONE_TIME_SET.has(cents);
}

/** Ist `cents` ein zulässiger Abo-Preispunkt? */
export function isAllowedSubscriptionPriceCents(cents: number): boolean {
  return SUB_SET.has(cents);
}

/** Ist `cents` ein zulässiger Trinkgeld-Preispunkt? */
export function isAllowedTipPriceCents(cents: number): boolean {
  return TIP_SET.has(cents);
}

/** `aera.unlock.{cents}` bei exaktem Pool-Match, sonst null (nicht kaufbar auf iOS). */
export function unlockAppleProductId(priceCents: number): string | null {
  return ONE_TIME_SET.has(priceCents) ? `aera.unlock.${priceCents}` : null;
}

/** `aera.tip.{cents}` bei exaktem Pool-Match, sonst null. */
export function tipAppleProductId(amountCents: number): string | null {
  return TIP_SET.has(amountCents) ? `aera.tip.${amountCents}` : null;
}

/** Trinkgeld-Presets für die TIPS-Space-Antwort. */
export function tipPresets(): { amountCents: number; appleProductId: string | null }[] {
  return TIP_PRICE_POINTS.map((cents) => ({
    amountCents: cents,
    appleProductId: tipAppleProductId(cents),
  }));
}

/** Betrag (Cents) aus einer `aera.tip.{cents}`-Produkt-ID; null wenn kein Pool-Produkt. */
export function parseTipAppleProductId(productId: string): number | null {
  const m = /^aera\.tip\.(\d+)$/.exec(productId);
  if (!m) return null;
  const cents = Number(m[1]);
  return TIP_SET.has(cents) ? cents : null;
}

/** Intervall + Betrag (Cents) aus einer `aera.sub.month|year.{cents}`-Produkt-ID; null wenn kein Pool-Produkt. */
export function parseSubscriptionAppleProductId(
  productId: string,
): { interval: "MONTH" | "YEAR"; priceCents: number } | null {
  const m = /^aera\.sub\.(month|year)\.(\d+)$/.exec(productId);
  if (!m) return null;
  const cents = Number(m[2]);
  if (!SUB_SET.has(cents)) return null;
  return { interval: m[1] === "month" ? "MONTH" : "YEAR", priceCents: cents };
}

/** `aera.sub.month.{cents}` / `aera.sub.year.{cents}` bei exaktem Pool-Match. */
export function subscriptionAppleProductId(
  interval: BillingInterval,
  priceCents: number,
): string | null {
  if (interval !== "MONTH" && interval !== "YEAR") return null;
  if (!SUB_SET.has(priceCents)) return null;
  return `aera.sub.${interval === "MONTH" ? "month" : "year"}.${priceCents}`;
}

/** Effektive Apple-Produkt-ID einer Mitgliedschafts-Stufe (explizit → Abo-Pool). */
export function tierAppleProductId(tier: {
  appleProductId: string | null;
  interval: BillingInterval;
  priceCents: number;
}): string | null {
  if (tier.interval === "FREE" || tier.priceCents <= 0) return null;
  if (tier.appleProductId) return tier.appleProductId;
  return subscriptionAppleProductId(tier.interval, tier.priceCents);
}

/**
 * Effektive Apple-Produkt-ID eines Shop-Produkts. Digitale Produkte (DIGITAL/
 * BUNDLE/COURSE_ACCESS/TIER_GRANT) nutzen den One-Time-Unlock-Pool: explizites
 * Mapping, sonst `aera.unlock.{cents}` für zulässige Preispunkte. PHYSICAL ist
 * nie per IAP kaufbar (iOS zeigt „Auf der Website verfügbar").
 */
export function productAppleProductId(product: {
  appleProductId: string | null;
  type: ProductType;
  priceCents: number;
}): string | null {
  if (product.type === "PHYSICAL") return null;
  if (product.priceCents <= 0) return null;
  return product.appleProductId ?? unlockAppleProductId(product.priceCents);
}

/** Auswahloptionen für One-Time-Preise: `{ cents, label }`, Label formatiert (z. B. "9,99 €"). */
export function oneTimePriceOptions(
  locale = "de",
  currency = "eur",
): { cents: number; label: string }[] {
  return ONE_TIME_PRICE_POINTS.map((cents) => ({
    cents,
    label: formatPrice(cents, currency, locale),
  }));
}

/** Auswahloptionen für Abo-Preise: `{ cents, label }`, Label formatiert (z. B. "9,99 €"). */
export function subscriptionPriceOptions(
  locale = "de",
  currency = "eur",
): { cents: number; label: string }[] {
  return SUBSCRIPTION_PRICE_POINTS.map((cents) => ({
    cents,
    label: formatPrice(cents, currency, locale),
  }));
}

/** Auswahloptionen für Trinkgeld-Preise: `{ cents, label }`, Label formatiert. */
export function tipPriceOptions(
  locale = "de",
  currency = "eur",
): { cents: number; label: string }[] {
  return TIP_PRICE_POINTS.map((cents) => ({
    cents,
    label: formatPrice(cents, currency, locale),
  }));
}
