// Apple-IAP-Produkt-Mapping (siehe API-CONTRACT.md §Apple).
//
// Reihenfolge der Auflösung:
//  1. Explizit: `MembershipTier.appleProductId` / `Product.appleProductId`.
//  2. Preis-Pool-Fallback für One-Time-Unlocks (Posts, Medien, Requests,
//     Booking): konsumierbare Produkte `aera.unlock.{cents}`.
//  3. Tips: `aera.tip.{cents}`.
//  4. Abo-Pool: `aera.sub.month.{cents}` / `aera.sub.year.{cents}` — nur wenn
//     kein explizites Mapping existiert.
//  5. PHYSICAL-Produkte: nie IAP (`appleProductId: null`).
//
// Bewusst ohne "server-only": reine Mapping-Logik, auch in Tests nutzbar.

import type { BillingInterval, ProductType } from "@/app/generated/prisma/client";

/** One-Time-Unlock-Pool (Posts, Medien, Media-Items, Requests, Booking). */
export const UNLOCK_PRICE_POOL_CENTS = [
  99, 199, 299, 499, 799, 999, 1499, 1999, 2999, 4999, 9999,
] as const;

/** Trinkgeld-Pool. */
export const TIP_PRICE_POOL_CENTS = [100, 300, 500, 1000, 2500, 5000] as const;

/** Abo-Pool (monatlich & jährlich, identische Cent-Stufen). */
export const SUBSCRIPTION_PRICE_POOL_CENTS = [
  299, 499, 799, 999, 1499, 1999, 2999, 4999,
] as const;

const UNLOCK_SET = new Set<number>(UNLOCK_PRICE_POOL_CENTS);
const TIP_SET = new Set<number>(TIP_PRICE_POOL_CENTS);
const SUB_SET = new Set<number>(SUBSCRIPTION_PRICE_POOL_CENTS);

/** `aera.unlock.{cents}` bei exaktem Pool-Match, sonst null (nicht kaufbar auf iOS). */
export function unlockAppleProductId(priceCents: number): string | null {
  return UNLOCK_SET.has(priceCents) ? `aera.unlock.${priceCents}` : null;
}

/** `aera.tip.{cents}` bei exaktem Pool-Match, sonst null. */
export function tipAppleProductId(amountCents: number): string | null {
  return TIP_SET.has(amountCents) ? `aera.tip.${amountCents}` : null;
}

/** Trinkgeld-Presets für die TIPS-Space-Antwort. */
export function tipPresets(): { amountCents: number; appleProductId: string | null }[] {
  return TIP_PRICE_POOL_CENTS.map((cents) => ({
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
 * Effektive Apple-Produkt-ID eines Shop-Produkts. Ausschließlich explizites
 * Mapping — der Unlock-Pool gilt laut Vertrag nur für Posts/Medien/Requests/
 * Booking. PHYSICAL ist nie per IAP kaufbar (iOS zeigt „Auf der Website
 * verfügbar").
 */
export function productAppleProductId(product: {
  appleProductId: string | null;
  type: ProductType;
  priceCents: number;
}): string | null {
  if (product.type === "PHYSICAL") return null;
  if (product.priceCents <= 0) return null;
  return product.appleProductId ?? null;
}
