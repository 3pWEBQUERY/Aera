import { Fragment } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PLANS, PLAN_ORDER, type PlanKey } from "@/lib/credit-plans";
import {
  FEATURE_KEYS,
  PLAN_LIMITS,
  SPACE_TYPE_KEYS,
  planAllowsFeature,
  planAllowsSpaceType,
} from "@/lib/plan-features";

/**
 * The honest version of the pricing page: one row per space type, feature and
 * limit, so a creator can see exactly what a package buys before they pay.
 * Rendered from the same matrix the app enforces at runtime — the table can
 * never drift from the product.
 */
export async function PlanCompareTable() {
  const t = await getTranslations("pricing.compare");
  const tSpaces = await getTranslations("dashboard.spaceTypes");
  const tFeatures = await getTranslations("dashboard.plans.features");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale);

  const limitValue = (value: number | null) =>
    value === null ? t("unlimited") : nf.format(value);

  const rows: {
    group: string;
    items: { key: string; label: string; cell: (plan: PlanKey) => React.ReactNode }[];
  }[] = [
    {
      group: t("spacesGroup"),
      items: SPACE_TYPE_KEYS.map((type) => ({
        key: `space-${type}`,
        label: tSpaces(`${type}.label`),
        cell: (plan: PlanKey) => <Mark on={planAllowsSpaceType(plan, type)} t={t} />,
      })),
    },
    {
      group: t("featuresGroup"),
      items: FEATURE_KEYS.map((feature) => ({
        key: `feature-${feature}`,
        label: tFeatures(`${feature}.title`),
        cell: (plan: PlanKey) => <Mark on={planAllowsFeature(plan, feature)} t={t} />,
      })),
    },
    {
      group: t("limitsGroup"),
      items: [
        {
          key: "limit-spaces",
          label: t("limitSpaces"),
          cell: (plan: PlanKey) => limitValue(PLAN_LIMITS[plan].maxSpaces),
        },
        {
          key: "limit-members",
          label: t("limitMembers"),
          cell: (plan: PlanKey) => limitValue(PLAN_LIMITS[plan].maxMembers),
        },
        {
          key: "limit-staff",
          label: t("limitStaff"),
          cell: (plan: PlanKey) => limitValue(PLAN_LIMITS[plan].maxStaff),
        },
        {
          key: "limit-tiers",
          label: t("limitTiers"),
          cell: (plan: PlanKey) => limitValue(PLAN_LIMITS[plan].maxTiers),
        },
        {
          key: "limit-storage",
          label: t("limitStorage"),
          cell: (plan: PlanKey) =>
            t("storageValue", { gb: nf.format(PLAN_LIMITS[plan].storageGb) }),
        },
        {
          key: "limit-credits",
          label: t("limitCredits"),
          cell: (plan: PlanKey) => nf.format(PLANS[plan].monthlyCredits),
        },
      ],
    },
  ];

  return (
    <section className="mt-24 border-t border-[#161613]/15 pt-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/50">
        {t("eyebrow")}
      </p>
      <h2 className="display-serif mt-4 max-w-2xl text-3xl leading-tight sm:text-4xl">
        {t("title")}
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[#161613]/65">
        {t("subtitle")}
      </p>

      <div className="mt-10 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-[#f4f1ea] py-3 pr-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#161613]/45"
              >
                {t("featureColumn")}
              </th>
              {PLAN_ORDER.map((plan) => (
                <th
                  key={plan}
                  scope="col"
                  className="w-[15%] px-3 py-3 text-center text-sm font-bold text-[#161613]"
                >
                  {PLANS[plan].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((section) => (
              <Fragment key={section.group}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={PLAN_ORDER.length + 1}
                    className="sticky left-0 bg-[#f4f1ea] pb-2 pt-8 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#161613]/45"
                  >
                    {section.group}
                  </th>
                </tr>
                {section.items.map((item) => (
                  <tr key={item.key} className="border-t border-[#161613]/10">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-[#f4f1ea] py-3 pr-4 text-sm font-medium text-[#161613]/80"
                    >
                      {item.label}
                    </th>
                    {PLAN_ORDER.map((plan) => (
                      <td
                        key={plan}
                        className="px-3 py-3 text-center text-sm tabular-nums text-[#161613]/70"
                      >
                        {item.cell(plan)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 max-w-2xl text-sm leading-6 text-[#161613]/50">{t("note")}</p>
    </section>
  );
}

function Mark({
  on,
  t,
}: {
  on: boolean;
  t: (key: string) => string;
}) {
  return on ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#161613] text-white">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span className="sr-only">{t("included")}</span>
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#161613]/15 text-[#161613]/25">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M6 12h12" />
      </svg>
      <span className="sr-only">{t("notIncluded")}</span>
    </span>
  );
}
