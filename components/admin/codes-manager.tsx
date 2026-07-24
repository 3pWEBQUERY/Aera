"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  adminCreatePromoCodesAction,
  adminDeletePromoCodeAction,
  adminTogglePromoCodeAction,
  type AdminState,
} from "@/app/actions/admin";
import { Icon } from "@/components/dashboard/icons";
import { PlanBadge, PLAN_LABEL } from "@/components/dashboard/plan-badge";
import { Input, Label } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { PlanKey } from "@/lib/plan-features";

export interface PromoCodeRow {
  id: string;
  code: string;
  plan: PlanKey;
  label: string | null;
  note: string | null;
  durationDays: number | null;
  maxRedemptions: number;
  redemptionCount: number;
  expiresAt: string | null;
  isActive: boolean;
  status: "ACTIVE" | "PAUSED" | "EXPIRED" | "USED_UP";
  createdAt: string;
  createdBy: string | null;
  recentRedemptions: {
    tenantName: string;
    tenantSlug: string;
    redeemedAt: string;
  }[];
}

const STATUS_TONE: Record<PromoCodeRow["status"], string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PAUSED: "bg-slate-100 text-slate-600 ring-slate-200",
  EXPIRED: "bg-amber-50 text-amber-700 ring-amber-200",
  USED_UP: "bg-slate-100 text-slate-500 ring-slate-200",
};

const initial: AdminState = {};

export function PromoCodesManager({
  codes,
  plans,
  stats,
}: {
  codes: PromoCodeRow[];
  plans: PlanKey[];
  stats: { total: number; active: number; redemptions: number };
}) {
  const t = useTranslations("admin.codes");
  const locale = useLocale();
  const [state, action, pending] = useActionState(adminCreatePromoCodesAction, initial);
  const [plan, setPlan] = useState<PlanKey>("PRO");
  const [filter, setFilter] = useState<"ALL" | PromoCodeRow["status"]>("ALL");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const formIds = {
    quantity: useId(),
    prefix: useId(),
    label: useId(),
    duration: useId(),
    max: useId(),
    expires: useId(),
  };

  const generated = state.ok && state.link ? state.link.split("\n").filter(Boolean) : [];

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      setCopied(null);
    }
  }
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    return codes.filter((c) => {
      if (filter !== "ALL" && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.code.includes(q) ||
        (c.label ?? "").toUpperCase().includes(q) ||
        c.plan.includes(q)
      );
    });
  }, [codes, filter, query]);

  return (
    <div>
      {/* ------------------------------------------------------------ head */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {(
          [
            { key: "statTotal", value: stats.total, icon: "sparkles" },
            { key: "statActive", value: stats.active, icon: "check" },
            { key: "statRedemptions", value: stats.redemptions, icon: "trendingUp" },
          ] as const
        ).map((s) => (
          <div key={s.key} className="rounded-2xl border border-slate-200 bg-white p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Icon name={s.icon} size={17} />
            </span>
            <p className="mt-3 text-2xl font-bold leading-none text-slate-900">{s.value}</p>
            <p className="mt-1 text-xs font-medium text-slate-400">{t(s.key)}</p>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------------- create */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">{t("createTitle")}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{t("createSubtitle")}</p>
        </div>

        <form action={action} className="space-y-5 p-5">
          <input type="hidden" name="plan" value={plan} />
          <FormError message={state.error} />

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">{t("planLabel")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {plans.map((p) => {
                const selected = p === plan;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPlan(p)}
                    className={cn(
                      "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
                      selected
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <PlanBadge plan={p} />
                    <span className="text-xs text-slate-400">{t(`planHint.${p}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor={formIds.quantity}>{t("quantityLabel")}</Label>
              <Input
                id={formIds.quantity}
                name="quantity"
                type="number"
                min={1}
                max={50}
                defaultValue={1}
              />
              <p className="mt-1 text-xs text-slate-400">{t("quantityHint")}</p>
            </div>
            <div>
              <Label htmlFor={formIds.prefix}>{t("prefixLabel")}</Label>
              <Input
                id={formIds.prefix}
                name="prefix"
                maxLength={12}
                placeholder={t("prefixPlaceholder")}
                className="uppercase"
              />
              <p className="mt-1 text-xs text-slate-400">{t("prefixHint")}</p>
            </div>
            <div>
              <Label htmlFor={formIds.label}>{t("labelLabel")}</Label>
              <Input
                id={formIds.label}
                name="label"
                maxLength={120}
                placeholder={t("labelPlaceholder")}
              />
              <p className="mt-1 text-xs text-slate-400">{t("labelHint")}</p>
            </div>
            <div>
              <Label htmlFor={formIds.duration}>{t("durationLabel")}</Label>
              <Input
                id={formIds.duration}
                name="durationDays"
                type="number"
                min={0}
                max={3650}
                defaultValue={0}
              />
              <p className="mt-1 text-xs text-slate-400">{t("durationHint")}</p>
            </div>
            <div>
              <Label htmlFor={formIds.max}>{t("maxLabel")}</Label>
              <Input
                id={formIds.max}
                name="maxRedemptions"
                type="number"
                min={1}
                max={100000}
                defaultValue={1}
              />
              <p className="mt-1 text-xs text-slate-400">{t("maxHint")}</p>
            </div>
            <div>
              <Label htmlFor={formIds.expires}>{t("expiresLabel")}</Label>
              <Input id={formIds.expires} name="expiresAt" type="date" />
              <p className="mt-1 text-xs text-slate-400">{t("expiresHint")}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
            >
              <Icon name="plus" size={17} />
              {pending ? t("creating") : t("createCta")}
            </button>
          </div>
        </form>

        {generated.length > 0 && (
          <div className="border-t border-slate-100 bg-emerald-50/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-emerald-800">
                {t("createdCount", { count: generated.length })}
              </p>
              <button
                type="button"
                onClick={() => copy(generated.join("\n"), "batch")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                <Icon name={copied === "batch" ? "check" : "copy"} size={14} />
                {copied === "batch" ? t("copied") : t("copyAll")}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {generated.map((code) => (
                <code
                  key={code}
                  className="rounded-lg bg-white px-2.5 py-1.5 font-mono text-sm font-semibold tracking-wider text-slate-800 ring-1 ring-emerald-200"
                >
                  {code}
                </code>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ list */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(["ALL", "ACTIVE", "PAUSED", "USED_UP", "EXPIRED"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                filter === f
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {t(`filter.${f}`)}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Icon name="sparkles" size={22} />
            </span>
            <p className="mt-4 font-semibold text-slate-800">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("emptyText")}</p>
          </div>
        ) : (
          visible.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300"
            >
              <div className="flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  onClick={() => copy(c.code, c.id)}
                  title={t("copyCode")}
                  className="group inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 font-mono text-sm font-bold tracking-wider text-white transition hover:bg-slate-800"
                >
                  {c.code}
                  <Icon
                    name={copied === c.id ? "check" : "copy"}
                    size={14}
                    className="text-white/60 transition group-hover:text-white"
                  />
                </button>

                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <PlanBadge plan={c.plan} />
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                      STATUS_TONE[c.status],
                    )}
                  >
                    {t(`status.${c.status}`)}
                  </span>
                  {c.label && (
                    <span className="truncate text-sm font-medium text-slate-600">{c.label}</span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <form action={adminTogglePromoCodeAction}>
                    <input type="hidden" name="codeId" value={c.id} />
                    <input type="hidden" name="isActive" value={String(!c.isActive)} />
                    <button
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                      title={c.isActive ? t("pause") : t("activate")}
                    >
                      <Icon name={c.isActive ? "eyeOff" : "eye"} size={16} />
                      <span className="hidden sm:inline">
                        {c.isActive ? t("pause") : t("activate")}
                      </span>
                    </button>
                  </form>
                  <form action={adminDeletePromoCodeAction}>
                    <input type="hidden" name="codeId" value={c.id} />
                    <button
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 transition hover:bg-red-50"
                      title={t("delete")}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </form>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="members" size={13} />
                  {t("usage", { used: c.redemptionCount, max: c.maxRedemptions })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="clock" size={13} />
                  {c.durationDays
                    ? t("runtimeDays", { days: c.durationDays })
                    : t("runtimeLifetime")}
                </span>
                {c.expiresAt && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="alert" size={13} />
                    {t("validUntil", { date: fmtDate(c.expiresAt) })}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="info" size={13} />
                  {t("createdMeta", {
                    date: fmtDate(c.createdAt),
                    name: c.createdBy ?? "—",
                  })}
                </span>
              </div>

              {c.maxRedemptions > 1 && (
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-all"
                    style={{
                      width: `${Math.min(100, Math.round((c.redemptionCount / c.maxRedemptions) * 100))}%`,
                    }}
                  />
                </div>
              )}

              {c.recentRedemptions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                  <span className="text-xs font-medium text-slate-400">
                    {t("redeemedBy")}
                  </span>
                  {c.recentRedemptions.map((r) => (
                    <span
                      key={r.tenantSlug}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                    >
                      {r.tenantName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <p className="mt-6 text-xs leading-5 text-slate-400">
        {t("footnote", { plans: PLAN_ORDER_LABEL })}
      </p>
    </div>
  );
}

const PLAN_ORDER_LABEL = (["FREE", "STARTER", "PRO", "SCALE"] as PlanKey[])
  .map((p) => PLAN_LABEL[p])
  .join(" · ");
