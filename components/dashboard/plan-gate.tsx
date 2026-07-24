"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { CreditsSheet } from "./credits-sheet";
import { RedeemCodeSheet } from "./redeem-code-sheet";
import { PlanBadge, PLAN_LABEL } from "./plan-badge";
import type { FeatureKey, PlanKey } from "@/lib/plan-features";

// ---------------------------------------------------------------------------
// Teaser previews
//
// A locked page shows what it *would* look like: a soft, blurred mock of the
// real screen behind the upgrade card. Frosted, never interactive, never
// pretending to hold real numbers.
// ---------------------------------------------------------------------------
type PreviewShape = "chart" | "grid" | "list" | "leaderboard";

const PREVIEW_BY_FEATURE: Record<FeatureKey, PreviewShape> = {
  analytics: "chart",
  products: "grid",
  payouts: "list",
  planner: "grid",
  gamification: "leaderboard",
  referrals: "chart",
  automations: "list",
  export: "list",
  mediaStudio: "grid",
  customDomain: "list",
  developers: "list",
  webhooks: "list",
};

const ICON_BY_FEATURE: Record<FeatureKey, IconName> = {
  analytics: "trendingUp",
  products: "products",
  payouts: "payouts",
  planner: "events",
  gamification: "gamification",
  referrals: "megaphone",
  automations: "clock",
  export: "export",
  mediaStudio: "sparkles",
  customDomain: "globe",
  developers: "bolt",
  webhooks: "bolt",
};

const BAR_HEIGHTS = [38, 62, 45, 78, 55, 92, 70, 84, 61, 96, 74, 88];

function Bone({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-slate-200/80", className)} />;
}

function Preview({ shape }: { shape: PreviewShape }) {
  if (shape === "chart") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <Bone className="h-2.5 w-16" />
              <Bone className="mt-3 h-6 w-24" />
              <Bone className="mt-2 h-2 w-20 bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <Bone className="h-3 w-40" />
          <div className="mt-6 flex h-40 items-end gap-2">
            {BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-gradient-to-t from-slate-200 to-slate-300"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (shape === "grid") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="h-24 bg-gradient-to-br from-slate-100 to-slate-200" />
            <div className="p-3">
              <Bone className="h-3 w-3/4" />
              <Bone className="mt-2 h-2.5 w-1/2 bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (shape === "leaderboard") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <div className="mx-auto h-10 w-10 rounded-xl bg-slate-200" />
              <Bone className="mx-auto mt-3 h-3 w-16" />
              <Bone className="mx-auto mt-2 h-2.5 w-10 bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0">
              <div className="h-8 w-8 rounded-lg bg-slate-200" />
              <Bone className="h-3 flex-1" />
              <Bone className="h-3 w-12 bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-slate-100 py-4 last:border-0">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-slate-200" />
          <div className="min-w-0 flex-1">
            <Bone className="h-3 w-2/5" />
            <Bone className="mt-2 h-2.5 w-3/5 bg-slate-100" />
          </div>
          <Bone className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export function PlanGate({
  slug,
  feature,
  currentPlan,
  requiredPlan,
}: {
  slug: string;
  feature: FeatureKey;
  currentPlan: PlanKey;
  requiredPlan: PlanKey;
}) {
  const [plansOpen, setPlansOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const t = useTranslations("dashboard.plans");
  const tf = useTranslations(`dashboard.plans.features.${feature}`);

  const bullets = ["b1", "b2", "b3"] as const;

  return (
    <div>
      {/* One grid cell holds teaser, veil and card, so the block is exactly as
          tall as whichever is bigger — no magic heights, no clipped card. */}
      <div className="isolate grid overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/70">
        {/* Frosted teaser of the real screen. */}
        <div
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 select-none p-6 opacity-70 blur-[5px] sm:p-8"
        >
          <Preview shape={PREVIEW_BY_FEATURE[feature]} />
        </div>

        <div
          aria-hidden="true"
          className="col-start-1 row-start-1 bg-gradient-to-b from-white/70 via-white/90 to-white"
        />

        {/* Upgrade card */}
        <div className="col-start-1 row-start-1 flex items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)] backdrop-blur-sm sm:p-8">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
              <Icon name={ICON_BY_FEATURE[feature]} size={26} />
            </span>

            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                {t("gateEyebrow")}
              </span>
              <PlanBadge plan={requiredPlan} locked />
            </div>

            <h1 className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">
              {tf("title")}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              {tf("description")}
            </p>

            <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left">
              {bullets.map((key) => (
                <li key={key} className="flex items-start gap-2.5 text-sm text-slate-600">
                  <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <Icon name="check" size={12} />
                  </span>
                  {tf(key)}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => setPlansOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2"
              >
                {t("upgradeCta", { plan: PLAN_LABEL[requiredPlan] })}
                <Icon name="arrowRight" size={16} />
              </button>
              <button
                type="button"
                onClick={() => setCodeOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              >
                <Icon name="sparkles" size={16} />
                {t("redeemCta")}
              </button>
            </div>

            <p className="mt-4 text-xs text-slate-400">
              {t("gateFootnote", { plan: PLAN_LABEL[currentPlan] })}
            </p>
          </div>
        </div>
      </div>

      <CreditsSheet
        open={plansOpen}
        onClose={() => setPlansOpen(false)}
        slug={slug}
        focusPlans
      />
      <RedeemCodeSheet open={codeOpen} onClose={() => setCodeOpen(false)} slug={slug} />
    </div>
  );
}
