// ---------------------------------------------------------------------------
// Platform fee — what Aera keeps from every sale inside a community.
//
// Pure data (no "server-only", no Prisma), so the marketing pages can state the
// same number the checkout charges. The authoritative value per community is
// `Tenant.platformFeePercent` (prisma/schema.prisma, `@default(5)`); this
// constant mirrors that default and is pinned to it by
// tests/platform-fee.test.ts. It is the same in every creator package — the
// plan matrix in lib/plan-features.ts has no fee column.
// ---------------------------------------------------------------------------

/** Standard platform fee in percent, applied to every sale in every package. */
export const PLATFORM_FEE_PERCENT = 5;

/** Locale-aware percent string, e.g. "5 %" (de/fr) or "5%" (en). */
export function formatPlatformFee(locale: string, percent = PLATFORM_FEE_PERCENT): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(percent / 100);
}
