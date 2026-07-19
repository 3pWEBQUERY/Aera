// Single source of truth for the platform's billing & display currency.
//
// Client-safe (no "server-only"): it reads a NEXT_PUBLIC_ variable so the
// server (Stripe checkout, price validation) and the client (price display)
// always agree on one currency. Change it for the whole platform by setting
// NEXT_PUBLIC_AERA_CURRENCY at build time; the default is Swiss Francs.
//
// This governs the fixed platform products (creator plans, AI credit packs)
// and the default currency of everything a creator newly puts up for sale.
// Existing rows keep the currency stored on them.

const SUPPORTED = ["chf", "eur", "usd", "gbp"] as const;
export type PlatformCurrency = (typeof SUPPORTED)[number];

function normalize(value: string | undefined | null): PlatformCurrency {
  const v = (value ?? "").trim().toLowerCase();
  return (SUPPORTED as readonly string[]).includes(v)
    ? (v as PlatformCurrency)
    : "chf";
}

/** Lower-case ISO currency code used across billing and display. */
export const PLATFORM_CURRENCY: PlatformCurrency = normalize(
  process.env.NEXT_PUBLIC_AERA_CURRENCY,
);
