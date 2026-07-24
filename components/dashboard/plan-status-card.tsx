"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";
import { CreditsSheet } from "./credits-sheet";
import { RedeemCodeSheet } from "./redeem-code-sheet";
import { PlanBadge, PLAN_LABEL } from "./plan-badge";
import type { PlanKey } from "@/lib/plan-features";

interface Quota {
  labelKey: "quotaSpaces" | "quotaMembers" | "quotaCredits";
  used: number;
  limit: number | null;
}

/**
 * "Your package" card on the dashboard overview.
 *
 * Shows what the community is on, how full each quota is, and the single next
 * step. Quotas are the honest part of the upsell: a creator sees the wall
 * before they run into it.
 */
export function PlanStatusCard({
  slug,
  plan,
  nextPlan,
  planSource,
  promoExpiresAt,
  quotas,
}: {
  slug: string;
  plan: PlanKey;
  nextPlan: PlanKey | null;
  planSource: "DEFAULT" | "STRIPE" | "PROMO";
  promoExpiresAt: string | null;
  quotas: Quota[];
}) {
  const [plansOpen, setPlansOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const t = useTranslations("dashboard.plans");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute inset-y-0 left-0 w-1 bg-[var(--brand)]" aria-hidden="true" />

        <div className="flex flex-col gap-5 px-5 py-5 pl-6 sm:px-6 sm:pl-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{t("statusTitle")}</h2>
              <PlanBadge plan={plan} />
              {planSource === "PROMO" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <Icon name="sparkles" size={11} />
                  {promoExpiresAt
                    ? t("promoUntil", {
                        date: new Date(promoExpiresAt).toLocaleDateString(locale, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }),
                      })
                    : t("promoLifetime")}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              {nextPlan
                ? t(`statusText.${plan}`, { next: PLAN_LABEL[nextPlan] })
                : t("statusTextMax")}
            </p>
          </div>

          {nextPlan && (
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setPlansOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2"
              >
                {t("upgradeCta", { plan: PLAN_LABEL[nextPlan] })}
                <Icon name="chevron" size={15} className="-rotate-90" />
              </button>
              <button
                type="button"
                onClick={() => setCodeOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              >
                <Icon name="sparkles" size={15} />
                {t("redeemCta")}
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-4 border-t border-slate-100 px-5 py-4 pl-6 sm:grid-cols-3 sm:px-6 sm:pl-7">
          {quotas.map((q) => {
            const pct =
              q.limit === null
                ? 0
                : Math.min(100, Math.round((q.used / Math.max(1, q.limit)) * 100));
            const tight = q.limit !== null && pct >= 80;
            return (
              <div key={q.labelKey}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {t(q.labelKey)}
                  </p>
                  <p
                    className={cn(
                      "text-xs font-semibold tabular-nums",
                      tight ? "text-amber-600" : "text-slate-500",
                    )}
                  >
                    {q.limit === null
                      ? `${nf.format(q.used)} · ${t("unlimited")}`
                      : `${nf.format(q.used)} / ${nf.format(q.limit)}`}
                  </p>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      q.limit === null
                        ? "bg-slate-200"
                        : tight
                          ? "bg-amber-500"
                          : "bg-slate-900",
                    )}
                    style={{ width: q.limit === null ? "100%" : `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <CreditsSheet
        open={plansOpen}
        onClose={() => setPlansOpen(false)}
        slug={slug}
        focusPlans
      />
      <RedeemCodeSheet open={codeOpen} onClose={() => setCodeOpen(false)} slug={slug} />
    </>
  );
}
