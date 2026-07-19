"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Sheet } from "./sheet";
import { Icon, type IconName } from "./icons";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";
import { PlanCard } from "@/components/pricing/plan-card";
import { PLATFORM_CURRENCY } from "@/lib/currency";

interface PlanInfo {
  key: string;
  name: string;
  monthlyCredits: number;
  priceCents: number;
  tagline: string;
  features: string[];
}
interface CreditPack {
  id: string;
  credits: number;
  priceCents: number;
  highlight?: boolean;
}
interface UsageEntry {
  id: string;
  kind: string;
  credits: number;
  totalTokens: number;
  createdAt: string;
}
export interface CreditSummary {
  plan: string;
  planName: string;
  monthlyCredits: number;
  includedRemaining: number;
  purchasedRemaining: number;
  balance: number;
  usedThisPeriod: number;
  periodStart: string;
  periodEnd: string;
  creatorSubscriptionStatus: string | null;
  planCancelAtPeriodEnd: boolean;
  planCurrentPeriodEnd: string | null;
  plans: PlanInfo[];
  packs: CreditPack[];
  recent: UsageEntry[];
  billingEnabled: boolean;
  cancellationEnabled: boolean;
}

const PLAN_ICON: Record<string, IconName> = {
  FREE: "sparkles",
  STARTER: "bolt",
  PRO: "trophy",
  SCALE: "crown",
};

export function CreditsSheet({
  open,
  onClose,
  slug,
  onChanged,
  initialCheckoutError = false,
  focusPlans = false,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  /** Called after balance changes so the header can refresh. */
  onChanged?: (s: CreditSummary) => void;
  initialCheckoutError?: boolean;
  /** Open the sheet directly at plan selection (for upgrade entry points). */
  focusPlans?: boolean;
}) {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [planSlide, setPlanSlide] = useState(0);
  const plansRef = useRef<HTMLElement>(null);
  const t = useTranslations("dashboard.credits");
  const tSafety = useTranslations("billingSafety");
  const [billingError, setBillingError] = useState<string | null>(() =>
    initialCheckoutError ? tSafety("checkoutFailed") : null,
  );
  const tpc = useTranslations("community.render.planCard");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/assistant/credits?slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = (await res.json()) as { summary: CreditSummary };
        setSummary(data.summary);
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open || !focusPlans || !summary) return;
    const frame = requestAnimationFrame(() => {
      plansRef.current?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPlans, open, summary]);

  useEffect(() => {
    if (!open || !summary) return;
    const currentIndex = summary.plans.findIndex((plan) => plan.key === summary.plan);
    setPlanSlide(Math.max(0, Math.floor(Math.max(0, currentIndex) / 2)));
  }, [open, summary]);

  const post = useCallback(
    async (body: Record<string, unknown>, busyKey: string) => {
      setBusy(busyKey);
      setBillingError(null);
      try {
        const res = await fetch(`/api/dashboard/assistant/credits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, ...body }),
        });
        const data = (await res.json()) as {
          url?: string;
          summary?: CreditSummary;
          error?: string;
          message?: string;
        };
        if (res.ok && data.url) {
          window.location.assign(data.url);
          return;
        }
        if (res.ok && data.summary) {
          setSummary(data.summary);
          onChanged?.(data.summary);
          return;
        }
        setBillingError(
          data.error === "existing_subscription"
            ? tSafety("activeSubscriptionError")
            : tSafety("checkoutFailed"),
        );
      } catch {
        setBillingError(tSafety("checkoutFailed"));
      } finally {
        setBusy(null);
      }
    },
    [slug, onChanged, tSafety],
  );

  const usedPct = summary
    ? Math.min(100, Math.round((summary.usedThisPeriod / Math.max(1, summary.monthlyCredits)) * 100))
    : 0;
  const planPages = summary
    ? Array.from({ length: Math.ceil(summary.plans.length / 2) }, (_, index) =>
        summary.plans.slice(index * 2, index * 2 + 2),
      )
    : [];

  return (
    <Sheet open={open} onClose={onClose} title={t("title")} subtitle={t("subtitle")} icon="bolt">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-6 sm:px-6">
          {loading && !summary ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              {t("loading")}
            </div>
          ) : summary ? (
            <div className="space-y-8">
              {/* Balance overview */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {t("availableBalance")}
                    </p>
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="text-4xl font-bold tracking-tight text-slate-900">
                        {nf.format(summary.balance)}
                      </span>
                      <span className="text-sm font-medium text-slate-400">{t("credits")}</span>
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
                    <Icon name={PLAN_ICON[summary.plan] ?? "bolt"} size={13} />
                    {t("planBadge", { name: summary.planName })}
                  </span>
                </div>

                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {t("usedOfCredits", {
                        used: nf.format(summary.usedThisPeriod),
                        total: nf.format(summary.monthlyCredits),
                      })}
                    </span>
                    <span>{usedPct}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[var(--brand)] transition-all"
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Stat label={t("monthlyRemaining")} value={`${nf.format(summary.includedRemaining)}`} sub={t("fromPack")} />
                  <Stat
                    label={t("purchased")}
                    value={`${nf.format(summary.purchasedRemaining)}`}
                    sub={t("rollsOver")}
                  />
                  <Stat label={t("reset")} value={fmtDate(summary.periodEnd)} sub={t("newQuota")} small />
                </div>
              </section>

              {!summary.billingEnabled && (
                <div
                  role="status"
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                >
                  <p className="font-semibold">{tSafety("creditsPaused")}</p>
                  <p className="mt-0.5 text-amber-700">{tSafety("creditsPausedText")}</p>
                </div>
              )}

              {billingError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {billingError}
                </div>
              )}

              {/* Credit packs */}
              <section>
                <SectionTitle icon="creditCard" title={t("buyCredits")} subtitle={t("buyOnceRolls")} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {summary.packs.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        "flex flex-col rounded-2xl border bg-white p-4",
                        p.highlight ? "border-[var(--brand-ring)] ring-1 ring-[var(--brand-ring)]" : "border-slate-200",
                      )}
                    >
                      {p.highlight && (
                        <span className="mb-2 inline-flex w-fit rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--brand)]">
                          {t("popular")}
                        </span>
                      )}
                      <p className="text-2xl font-bold text-slate-900">{nf.format(p.credits)}</p>
                      <p className="text-xs text-slate-400">{t("credits")}</p>
                      <p className="mt-3 text-sm font-semibold text-slate-700">{formatPrice(p.priceCents, PLATFORM_CURRENCY, locale)}</p>
                      <div className="mt-auto pt-3">
                        <button
                          type="button"
                          disabled={busy !== null || !summary.billingEnabled}
                          onClick={() => post({ action: "buy", packId: p.id }, `buy_${p.id}`)}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                        >
                          {!summary.billingEnabled
                            ? tSafety("unavailableAction")
                            : busy === `buy_${p.id}`
                              ? t("buying")
                              : t("buy")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Plans */}
              <section ref={plansRef} className="scroll-mt-6">
                <SectionTitle
                  icon="tiers"
                  title={t("managePlan")}
                  subtitle={t("moreCreditsMonth")}
                  actions={
                    planPages.length > 1 ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={planSlide === 0}
                          onClick={() => setPlanSlide((value) => Math.max(0, value - 1))}
                          aria-label={`← ${t("managePlan")}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-default disabled:opacity-35"
                        >
                          <Icon name="chevron" size={15} className="rotate-90" />
                        </button>
                        <span className="min-w-9 text-center text-xs font-semibold tabular-nums text-slate-400" aria-live="polite">
                          {planSlide + 1}/{planPages.length}
                        </span>
                        <button
                          type="button"
                          disabled={planSlide >= planPages.length - 1}
                          onClick={() =>
                            setPlanSlide((value) => Math.min(planPages.length - 1, value + 1))
                          }
                          aria-label={`${t("managePlan")} →`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-default disabled:opacity-35"
                        >
                          <Icon name="chevron" size={15} className="-rotate-90" />
                        </button>
                      </div>
                    ) : null
                  }
                />
                <div className="overflow-hidden pb-1 pt-1">
                  <div
                    className="flex transition-transform duration-300 ease-out"
                    style={{ transform: `translateX(-${planSlide * 100}%)` }}
                  >
                    {planPages.map((plans, pageIndex) => (
                      <div
                        key={plans.map((plan) => plan.key).join("-")}
                        className="grid w-full shrink-0 grid-cols-2 items-stretch gap-2 px-1.5 sm:gap-4 sm:px-1"
                        aria-hidden={pageIndex !== planSlide}
                        inert={pageIndex !== planSlide}
                      >
                        {plans.map((plan) => {
                          const current = plan.key === summary.plan;
                          return (
                            <PlanCard
                              key={plan.key}
                              name={plan.name}
                              tagline={plan.tagline}
                              priceCents={plan.priceCents}
                              features={plan.features}
                              featured={plan.key === "PRO" && !current}
                              current={current}
                              compact
                              labels={{
                                locale,
                                current: tpc("current"),
                                popular: tpc("popular"),
                                perMonth: tpc("perMonth"),
                                free: tpc("free"),
                                credits: tpc("creditsPerMonth", {
                                  count: nf.format(plan.monthlyCredits),
                                }),
                              }}
                            >
                              <button
                                type="button"
                                disabled={
                                  current ||
                                  busy !== null ||
                                  !summary.billingEnabled ||
                                  plan.priceCents <= 0
                                }
                                onClick={() =>
                                  post({ action: "plan", plan: plan.key }, `plan_${plan.key}`)
                                }
                                className={cn(
                                  "inline-flex w-full items-center justify-center rounded-xl px-2 py-2.5 text-xs font-semibold transition disabled:cursor-default sm:px-3 sm:text-sm",
                                  current
                                    ? "bg-slate-100 text-slate-400"
                                    : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50",
                                )}
                              >
                                {!summary.billingEnabled && !current
                                  ? tSafety("unavailableAction")
                                  : current
                                    ? t("currentPlan")
                                    : busy === `plan_${plan.key}`
                                      ? t("switching")
                                      : t("switchPlan")}
                              </button>
                            </PlanCard>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                {summary.creatorSubscriptionStatus && summary.plan !== "FREE" && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    {summary.planCancelAtPeriodEnd ? (
                      <p className="text-sm text-slate-600">
                        {tSafety("creatorPlanEnds", {
                          date: fmtDate(summary.planCurrentPeriodEnd ?? summary.periodEnd),
                        })}
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-600">{tSafety("creatorPlanCancelHint")}</p>
                        <button
                          type="button"
                          disabled={busy !== null || !summary.cancellationEnabled}
                          onClick={() => post({ action: "cancel_plan" }, "cancel_plan")}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {busy === "cancel_plan"
                            ? tSafety("creatorPlanCanceling")
                            : tSafety("creatorPlanCancel")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Usage history */}
              <section>
                <SectionTitle icon="trendingUp" title={t("recentUsage")} subtitle={t("usagePerRequest")} />
                {summary.recent.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                    {t("noUsage")}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {summary.recent.map((r) => (
                      <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                            <Icon name="sparkles" size={13} />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-slate-700">{t("aiRequest")}</p>
                            <p className="text-[11px] text-slate-400">
                              {t("usageMeta", { date: fmtDateTime(r.createdAt), tokens: nf.format(r.totalTokens) })}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-slate-900">−{nf.format(r.credits)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              {t("loadFailed")}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  sub,
  small,
}: {
  label: string;
  value: string;
  sub: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("mt-0.5 font-bold text-slate-900", small ? "text-sm" : "text-lg")}>{value}</p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Icon name={icon} size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        </div>
      </div>
      {actions}
    </div>
  );
}
