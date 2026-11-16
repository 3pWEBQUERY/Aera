import { getLocale, getTranslations } from "next-intl/server";
import { PLAN_ORDER, PLANS, type PlanKey } from "@/lib/credit-plans";
import {
  minPlanForFeature,
  minPlanForSpaceType,
  type FeatureKey,
  type SpaceTypeKey,
} from "@/lib/plan-features";
import { cn } from "@/lib/utils";

export type GatedItem = { space: SpaceTypeKey } | { feature: FeatureKey };

/** Lowest package that unlocks the item — straight from the enforced matrix. */
export function minPlanFor(item: GatedItem): PlanKey {
  return "space" in item ? minPlanForSpaceType(item.space) : minPlanForFeature(item.feature);
}

/**
 * "Ab Starter: Shop, Chat · Ab Pro: Podcast" under a marketing paragraph.
 *
 * Marketing texts describe the whole product; this line says which part of it
 * needs a paid package. It is computed from lib/plan-features.ts (the same
 * matrix the server enforces), so a text can never promise more than the Free
 * package delivers. Items available in Free are dropped; with nothing gated the
 * line renders nothing.
 */
export async function PlanAvailability({
  items,
  tone = "light",
  className,
}: {
  items: GatedItem[];
  /** "light" = dark text on beige, "dark" = light text on the dark sections. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const t = await getTranslations("marketing");
  const tSpaces = await getTranslations("dashboard.spaceTypes");
  const tFeatures = await getTranslations("dashboard.plans.features");
  const list = new Intl.ListFormat(await getLocale(), { type: "conjunction" });

  const groups = PLAN_ORDER.filter((plan) => plan !== "FREE")
    .map((plan) => ({
      plan,
      labels: items
        .filter((item) => minPlanFor(item) === plan)
        .map((item) =>
          "space" in item ? tSpaces(`${item.space}.label`) : tFeatures(`${item.feature}.title`),
        ),
    }))
    .filter((group) => group.labels.length > 0);

  if (groups.length === 0) return null;

  return (
    <p
      className={cn(
        "text-sm leading-6",
        tone === "dark" ? "text-white/65" : "text-[#161613]/65",
        className,
      )}
    >
      {groups.map((group, i) => (
        <span key={group.plan}>
          {i > 0 && (
            <span aria-hidden="true" className="mx-1.5">
              ·
            </span>
          )}
          {t("availableFrom", { plan: PLANS[group.plan].name, items: list.format(group.labels) })}
        </span>
      ))}
    </p>
  );
}
