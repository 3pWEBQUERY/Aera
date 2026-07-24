import { getTenantPlan } from "@/lib/plan";
import {
  minPlanForFeature,
  planAllowsFeature,
  type FeatureKey,
} from "@/lib/plan-features";
import { PlanGate } from "./plan-gate";

/**
 * Page-level paywall.
 *
 * Returns the teaser screen when the community's package does not include
 * `feature`, or `null` when it does. Call it as the first `await` in a gated
 * page and bail out immediately — that way the page's real queries never even
 * run for a locked community:
 *
 * ```tsx
 * const locked = await featureGate(tenant.id, slug, "analytics");
 * if (locked) return locked;
 * ```
 *
 * Mutations are gated separately inside their own server actions; this only
 * guards reads and the UI.
 */
export async function featureGate(
  tenantId: string,
  slug: string,
  feature: FeatureKey,
): Promise<React.ReactElement | null> {
  const plan = await getTenantPlan(tenantId);
  if (planAllowsFeature(plan, feature)) return null;
  return (
    <PlanGate
      slug={slug}
      feature={feature}
      currentPlan={plan}
      requiredPlan={minPlanForFeature(feature)}
    />
  );
}
