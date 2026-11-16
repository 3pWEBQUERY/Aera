"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import type { CreditSummary } from "./credits-sheet";
import { cn, formatPrice } from "@/lib/utils";
import { PLATFORM_CURRENCY } from "@/lib/currency";
import { PLANS, PLAN_ORDER, type PlanKey } from "@/lib/credit-plans";
import {
  PLAN_LIMITS,
  PLAN_RANK,
  featuresIntroducedBy,
  spaceTypesIntroducedBy,
} from "@/lib/plan-features";

/**
 * "Paket wechseln" — what each creator package actually contains.
 *
 * Every upgrade path (space limit, locked feature, locked space type) lands
 * here instead of in the AI-credit sheet: the rows come straight from
 * lib/plan-features, the same matrix the server enforces, so the sheet cannot
 * promise more than the product does. The credits sheet stays for AI credits.
 */
export function PlanSwitchSheet({
  open,
  onClose,
  slug,
  notice,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  /** Why the sheet opened, e.g. "Du nutzt 5 von 5 Spaces." */
  notice?: string | null;
}) {
  const t = useTranslations("dashboard.planSheet");
  const tCompare = useTranslations("pricing.compare");
  const tSafety = useTranslations("billingSafety");
  const tSpaces = useTranslations("dashboard.spaceTypes");
  const tFeatures = useTranslations("dashboard.plans.features");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // The error belongs to the button that caused it — shown right below it.
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch(`/api/dashboard/assistant/credits?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { summary: CreditSummary };
      setSummary(data.summary);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (open) {
      setError(null);
      void load();
    }
  }, [open, load]);

  async function post(body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/assistant/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, returnPath: window.location.pathname, ...body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        summary?: CreditSummary;
        error?: string;
      };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      if (res.ok && data.summary) {
        setSummary(data.summary);
        return;
      }
      setError({
        key: busyKey,
        message:
          data.error === "existing_subscription"
            ? tSafety("activeSubscriptionError")
            : busyKey === "cancel_plan"
              ? t("cancelFailed")
              : t("checkoutFailed"),
      });
    } catch {
      setError({
        key: busyKey,
        message: busyKey === "cancel_plan" ? t("cancelFailed") : t("checkoutFailed"),
      });
    } finally {
      setBusy(null);
    }
  }

  const current = (summary?.plan ?? "FREE") as PlanKey;
  const hasSubscription = Boolean(summary?.creatorSubscriptionStatus) && current !== "FREE";
  const limit = (value: number | null, key: string, unlimitedKey: string) =>
    value === null ? t(unlimitedKey) : t(key, { count: value, n: nf.format(value) });

  return (
    <Sheet open={open} onClose={onClose} title={t("title")} subtitle={t("subtitle")} icon="tiers">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          {notice && (
            <p
              role="status"
              className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800"
            >
              {notice}
            </p>
          )}

          {loading && !summary ? (
            <p className="flex h-48 items-center justify-center text-sm text-slate-500">
              {t("loading")}
            </p>
          ) : !summary ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-slate-600">
              <p role="alert">{loadFailed ? t("loadFailed") : t("loading")}</p>
              {loadFailed && (
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {t("retry")}
                </button>
              )}
            </div>
          ) : (
            <>
              {!summary.billingEnabled && (
                <div
                  role="status"
                  className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                >
                  <p className="font-semibold">{tSafety("creditsPaused")}</p>
                  <p className="mt-0.5 text-amber-700">{tSafety("creditsPausedText")}</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {PLAN_ORDER.map((plan, index) => {
                  const info = PLANS[plan];
                  const limits = PLAN_LIMITS[plan];
                  const isCurrent = plan === current;
                  const previous = index > 0 ? PLAN_ORDER[index - 1] : null;
                  const newTypes = spaceTypesIntroducedBy(plan).map((type) =>
                    tSpaces(`${type}.label`),
                  );
                  const newFeatures = featuresIntroducedBy(plan).map((feature) =>
                    tFeatures(`${feature}.title`),
                  );
                  const busyKey = `plan_${plan}`;
                  const isUpgrade = PLAN_RANK[plan] > PLAN_RANK[current];
                  return (
                    <section
                      key={plan}
                      aria-labelledby={`plan-${plan}-title`}
                      className={cn(
                        "flex flex-col rounded-2xl border bg-white p-5",
                        isCurrent
                          ? "border-[var(--action-strong)] ring-1 ring-[var(--action-strong)]"
                          : "border-slate-200",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 id={`plan-${plan}-title`} className="text-base font-bold text-slate-900">
                            {info.name}
                          </h3>
                          <p className="mt-0.5 text-sm text-slate-600">
                            {info.priceCents > 0
                              ? t("pricePerMonth", {
                                  price: formatPrice(info.priceCents, PLATFORM_CURRENCY, locale),
                                })
                              : t("free")}
                          </p>
                        </div>
                        {isCurrent && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--action)] px-2.5 py-1 text-xs font-semibold text-[var(--action-fg)]">
                            <Icon name="check" size={12} />
                            {t("current")}
                          </span>
                        )}
                      </div>

                      <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
                        <li>{limit(limits.maxSpaces, "limitSpaces", "limitSpacesUnlimited")}</li>
                        <li>{limit(limits.maxMembers, "limitMembers", "limitMembersUnlimited")}</li>
                        <li>{limit(limits.maxTiers, "limitTiers", "limitTiersUnlimited")}</li>
                        <li>{limit(limits.maxStaff, "limitStaff", "limitStaffUnlimited")}</li>
                        <li>
                          {tCompare("limitStorage")}:{" "}
                          {tCompare("storageValue", { gb: nf.format(limits.storageGb) })}
                        </li>
                        <li>{t("limitCredits", { n: nf.format(info.monthlyCredits) })}</li>
                      </ul>

                      <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
                        <p className="font-medium text-slate-900">
                          {previous
                            ? t("everythingFrom", { plan: PLANS[previous].name })
                            : t("baseSpaces")}
                        </p>
                        <ul className="mt-1.5 space-y-1 text-slate-600">
                          {newTypes.length > 0 && (
                            <li className="flex gap-2">
                              <Icon name="check" size={14} className="mt-0.5 shrink-0 text-emerald-700" />
                              <span>{t("spaceTypesList", { list: newTypes.join(", ") })}</span>
                            </li>
                          )}
                          {newFeatures.map((label) => (
                            <li key={label} className="flex gap-2">
                              <Icon name="check" size={14} className="mt-0.5 shrink-0 text-emerald-700" />
                              <span>{label}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-auto pt-5">
                        {isCurrent ? (
                          <p className="rounded-xl bg-slate-100 px-3 py-2.5 text-center text-sm font-semibold text-slate-600">
                            {t("currentPlan")}
                          </p>
                        ) : plan === "FREE" ? (
                          <p className="text-sm text-slate-500">{t("freeHint")}</p>
                        ) : hasSubscription ? (
                          <p className="text-sm text-slate-500">{tSafety("switchBlocked")}</p>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy !== null || !summary.billingEnabled}
                              aria-describedby={
                                error?.key === busyKey ? `${busyKey}-error` : undefined
                              }
                              onClick={() => void post({ action: "plan", plan }, busyKey)}
                              className={cn(
                                "inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50",
                                isUpgrade
                                  ? "bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-[var(--primary-hover)]"
                                  : "bg-[var(--action)] text-[var(--action-fg)] hover:bg-[var(--action-hover)]",
                              )}
                            >
                              {!summary.billingEnabled
                                ? tSafety("unavailableAction")
                                : busy === busyKey
                                  ? t("switching")
                                  : t("switchTo", { plan: info.name })}
                            </button>
                            {error?.key === busyKey && (
                              <p
                                id={`${busyKey}-error`}
                                role="alert"
                                className="mt-2 text-sm text-red-700"
                              >
                                {error.message}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>

              {hasSubscription && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  {summary.planCancelAtPeriodEnd ? (
                    <p className="text-sm text-slate-600">
                      {tSafety("creatorPlanEnds", {
                        date: fmtDate(summary.planCurrentPeriodEnd ?? summary.periodEnd),
                      })}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-600">{tSafety("creatorPlanCancelHint")}</p>
                      <div>
                        <button
                          type="button"
                          disabled={busy !== null || !summary.cancellationEnabled}
                          onClick={() => void post({ action: "cancel_plan" }, "cancel_plan")}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {busy === "cancel_plan"
                            ? tSafety("creatorPlanCanceling")
                            : tSafety("creatorPlanCancel")}
                        </button>
                        {error?.key === "cancel_plan" && (
                          <p role="alert" className="mt-2 text-sm text-red-700">
                            {error.message}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="mt-5 text-xs text-slate-500">{t("footnote")}</p>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
