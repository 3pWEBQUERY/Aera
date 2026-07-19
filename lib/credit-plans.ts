// ---------------------------------------------------------------------------
// Shared credit-plan catalog — the single source of truth for both the public
// pricing page and the in-app "Credits & Nutzung" popover.
//
// Pure data only: no "server-only", no Prisma imports, so it can be pulled into
// server components, client components and API routes alike.
// ---------------------------------------------------------------------------

// Mirrors the Prisma `CreatorPlan` enum (structurally identical string union).
export type PlanKey = "FREE" | "STARTER" | "PRO" | "SCALE";

// Credits are the assistant's usage currency. Each Gemini call is metered by
// its token count and rounded up to whole credits (min. 1 per message).
export const TOKENS_PER_CREDIT = 1000;

export function creditsForTokens(totalTokens: number): number {
  if (!totalTokens || totalTokens <= 0) return 1;
  return Math.max(1, Math.ceil(totalTokens / TOKENS_PER_CREDIT));
}

export interface PlanInfo {
  key: PlanKey;
  name: string;
  monthlyCredits: number;
  priceCents: number;
  /** Media storage included with the plan (Railway bucket), in GB. */
  storageGb: number;
  tagline: string;
  features: string[];
}

// Creator packages. `monthlyCredits` refills each billing period.
export const PLANS: Record<PlanKey, PlanInfo> = {
  FREE: {
    key: "FREE",
    name: "Free",
    monthlyCredits: 500,
    priceCents: 0,
    storageGb: 1,
    tagline: "Zum Ausprobieren",
    features: [
      "500 AI-Credits pro Monat",
      "AI-Assistent für Texte & Ideen",
      "Community-Analysen",
      "E-Mail-Support",
    ],
  },
  STARTER: {
    key: "STARTER",
    name: "Starter",
    monthlyCredits: 2500,
    priceCents: 1900,
    storageGb: 25,
    tagline: "Für den regelmäßigen Einsatz",
    features: [
      "2.500 AI-Credits pro Monat",
      "Alles aus Free",
      "Spaces per AI erstellen",
      "Beiträge & Beschreibungen generieren",
    ],
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    monthlyCredits: 12000,
    priceCents: 4900,
    storageGb: 100,
    tagline: "Für aktive Creator",
    features: [
      "12.000 AI-Credits pro Monat",
      "Alles aus Starter",
      "Priorisierte Antworten",
      "Erweiterte Community-Analysen",
    ],
  },
  SCALE: {
    key: "SCALE",
    name: "Scale",
    monthlyCredits: 50000,
    priceCents: 14900,
    storageGb: 500,
    tagline: "Für Teams & Power-User",
    features: [
      "50.000 AI-Credits pro Monat",
      "Alles aus Pro",
      "Höchstes Nutzungslimit",
      "Voller Funktionsumfang",
    ],
  },
};

export const PLAN_ORDER: PlanKey[] = ["FREE", "STARTER", "PRO", "SCALE"];

/**
 * Parse the public plan intent. Only catalog keys are accepted; Stripe Price
 * IDs and arbitrary client values never cross this boundary.
 */
export function parsePlanKey(value: unknown): PlanKey | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return PLAN_ORDER.includes(normalized as PlanKey)
    ? (normalized as PlanKey)
    : null;
}

/** Internal route carried through signup/login until creator onboarding. */
export function creatorPlanStartPath(plan: PlanKey): string {
  return `/start?plan=${encodeURIComponent(plan)}`;
}

/** Public pricing CTA. `next` is encoded as one same-site redirect value. */
export function creatorPlanSignupHref(plan: PlanKey): string {
  return `/signup?next=${encodeURIComponent(creatorPlanStartPath(plan))}`;
}

// The plan we visually highlight as "Beliebt".
export const FEATURED_PLAN: PlanKey = "PRO";

export interface CreditPack {
  id: string;
  credits: number;
  priceCents: number;
  highlight?: boolean;
}

// One-time top-ups. Purchased credits roll over and are used after the monthly
// allowance is exhausted.
export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_1k", credits: 1000, priceCents: 500 },
  { id: "pack_5k", credits: 5000, priceCents: 2000, highlight: true },
  { id: "pack_15k", credits: 15000, priceCents: 4900 },
];
