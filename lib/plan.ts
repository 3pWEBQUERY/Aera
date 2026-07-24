import "server-only";
import { cache } from "react";
import prisma from "./prisma";
import {
  capabilitiesFor,
  limitsForPlan,
  planAllowsFeature,
  planAllowsSpaceType,
  withinLimit,
  type FeatureKey,
  type PlanCapabilities,
  type PlanKey,
} from "./plan-features";

export type { PlanKey, FeatureKey, PlanCapabilities };

/**
 * Resolve the tenant's active creator package.
 *
 * Deliberately a plain wallet read rather than `getOrCreateWallet`: this runs
 * on every dashboard render, every gated action and every webhook delivery, so
 * it must stay cheap and must not pull the whole billing module into contexts
 * (cron workers, webhook delivery) that have no business creating wallets.
 *
 * A tenant without a wallet row is FREE — the row is created lazily by the
 * first credit operation. An elapsed promotion is treated as FREE here too;
 * lib/credits.ts writes that downgrade back on the next wallet read.
 *
 * Request-deduped: layout, page and nested actions share one lookup.
 */
export const getTenantPlan = cache(async function getTenantPlan(
  tenantId: string,
): Promise<PlanKey> {
  const wallet = await prisma.aiCreditWallet.findUnique({
    where: { tenantId },
    select: { plan: true, planSource: true, promoExpiresAt: true },
  });
  if (!wallet) return "FREE";
  const promoElapsed =
    wallet.planSource === "PROMO" &&
    wallet.promoExpiresAt !== null &&
    wallet.promoExpiresAt <= new Date();
  return promoElapsed ? "FREE" : wallet.plan;
});

/** Full capability snapshot — safe to hand to client components. */
export const getPlanCapabilities = cache(async function getPlanCapabilities(
  tenantId: string,
): Promise<PlanCapabilities> {
  return capabilitiesFor(await getTenantPlan(tenantId));
});

/** `true` when the tenant's package unlocks `feature`. */
export async function tenantHasFeature(
  tenantId: string,
  feature: FeatureKey,
): Promise<boolean> {
  return planAllowsFeature(await getTenantPlan(tenantId), feature);
}

/** `true` when the tenant's package may create spaces of `type`. */
export async function tenantAllowsSpaceType(
  tenantId: string,
  type: string,
): Promise<boolean> {
  return planAllowsSpaceType(await getTenantPlan(tenantId), type);
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number | null;
  plan: PlanKey;
}

/** Space budget: archived spaces don't count against the quota. */
export async function checkSpaceLimit(tenantId: string): Promise<LimitCheck> {
  const plan = await getTenantPlan(tenantId);
  const limit = limitsForPlan(plan).maxSpaces;
  const current = await prisma.space.count({
    where: { tenantId, isArchived: false },
  });
  return { allowed: withinLimit(current, limit), current, limit, plan };
}

/** Member budget — checked before a join/invite is accepted. */
export async function checkMemberLimit(tenantId: string): Promise<LimitCheck> {
  const plan = await getTenantPlan(tenantId);
  const limit = limitsForPlan(plan).maxMembers;
  const current = await prisma.membership.count({
    where: { tenantId, status: "ACTIVE" },
  });
  return { allowed: withinLimit(current, limit), current, limit, plan };
}

/** Membership tiers a creator may offer. */
export async function checkTierLimit(tenantId: string): Promise<LimitCheck> {
  const plan = await getTenantPlan(tenantId);
  const limit = limitsForPlan(plan).maxTiers;
  const current = await prisma.membershipTier.count({ where: { tenantId } });
  return { allowed: withinLimit(current, limit), current, limit, plan };
}

/** Staff seats besides the owner (ADMIN + MODERATOR). */
export async function checkStaffLimit(tenantId: string): Promise<LimitCheck> {
  const plan = await getTenantPlan(tenantId);
  const limit = limitsForPlan(plan).maxStaff;
  const current = await prisma.membership.count({
    where: { tenantId, status: "ACTIVE", role: { in: ["ADMIN", "MODERATOR"] } },
  });
  return { allowed: withinLimit(current, limit), current, limit, plan };
}

// ---------------------------------------------------------------------------
// Mutation guards
//
// Page-level gating (components/dashboard/feature-gate) only hides reads.
// Server actions and API routes are separately reachable — a client bundle
// keeps working Server Action ids after a downgrade — so every mutating entry
// point behind a package must call one of these.
// ---------------------------------------------------------------------------

/**
 * Returns a translated error message when `feature` is not part of the
 * tenant's package, or `null` when it is. Use in server actions:
 *
 * ```ts
 * const blocked = await featureBlocked(tenant.id, "automations");
 * if (blocked) return { error: blocked };
 * ```
 */
export async function featureBlocked(
  tenantId: string,
  feature: FeatureKey,
): Promise<string | null> {
  if (await tenantHasFeature(tenantId, feature)) return null;
  const { tErr } = await import("./action-errors");
  const { PLANS } = await import("./credit-plans");
  const { minPlanForFeature } = await import("./plan-features");
  return tErr("planFeatureLocked", { plan: PLANS[minPlanForFeature(feature)].name });
}

/** Boolean twin of `featureBlocked` for API routes (no i18n needed). */
export async function assertFeature(
  tenantId: string,
  feature: FeatureKey,
): Promise<boolean> {
  return tenantHasFeature(tenantId, feature);
}
