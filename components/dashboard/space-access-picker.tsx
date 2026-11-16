"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cn, formatPrice } from "@/lib/utils";
import { Icon } from "./icons";

/** A membership tier as the space form needs it (see spaces/page.tsx). */
export interface SpaceAccessTier {
  name: string;
  key: string;
  priceCents: number;
  currency: string;
  interval: string;
  isPublic: boolean;
}

/** "9,99 CHF/Monat" — the same wording as the join page. */
export function useTierPriceLabel() {
  const locale = useLocale();
  const t = useTranslations("dashboard.spaces.access");
  return (tier: Pick<SpaceAccessTier, "priceCents" | "currency" | "interval">) => {
    const price = formatPrice(tier.priceCents, tier.currency, locale);
    if (tier.interval === "MONTH") return t("pricePerMonth", { price });
    if (tier.interval === "YEAR") return t("pricePerYear", { price });
    return price;
  };
}

/**
 * Who may enter a paid space.
 *
 * The data model holds exactly one key per space (`requiredEntitlementKey`),
 * so this is a single choice: one paid membership, or "any paid membership"
 * (empty key — PAID visibility then accepts every paid entitlement). A key the
 * creator would have to type could lock paying members out with one typo; the
 * action re-checks the chosen key against the tenant's tiers anyway.
 */
export function SpaceAccessPicker({
  slug,
  tiers,
  currentKey,
  name = "requiredEntitlementKey",
}: {
  slug: string;
  tiers: SpaceAccessTier[];
  /** Key already stored on the space (edit mode). */
  currentKey?: string | null;
  name?: string;
}) {
  const t = useTranslations("dashboard.spaces.access");
  const priceLabel = useTierPriceLabel();
  const legendId = useId();
  const hintId = useId();
  const paid = tiers.filter((tier) => tier.priceCents > 0);
  const legacyKey =
    currentKey && !paid.some((tier) => tier.key === currentKey) ? currentKey : null;
  const legacyTier = legacyKey ? tiers.find((tier) => tier.key === legacyKey) : undefined;
  const [value, setValue] = useState(currentKey ?? "");

  if (paid.length === 0 && !legacyKey) {
    return (
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
        <input type="hidden" name={name} value="" />
        <p className="text-sm font-semibold text-slate-900">{t("noPaidTitle")}</p>
        <p className="mt-0.5 text-sm text-slate-700">{t("noPaidText")}</p>
        <Link
          href={`/dashboard/${slug}/tiers`}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 underline decoration-slate-400 underline-offset-4 hover:decoration-slate-900"
        >
          {t("noPaidCta")}
          <Icon name="arrowRight" size={14} />
        </Link>
      </div>
    );
  }

  const options: { value: string; label: string; desc: string }[] = [
    { value: "", label: t("anyPaid"), desc: t("anyPaidDesc") },
    ...paid.map((tier) => ({
      value: tier.key,
      label: tier.name,
      desc: tier.isPublic
        ? priceLabel(tier)
        : t("tierHidden", { price: priceLabel(tier) }),
    })),
    ...(legacyKey
      ? [
          {
            value: legacyKey,
            label: legacyTier ? legacyTier.name : t("legacyLabel"),
            desc: legacyTier ? t("legacyFreeTier") : t("legacyKey", { key: legacyKey }),
          },
        ]
      : []),
  ];

  return (
    <fieldset className="mt-6" aria-describedby={hintId}>
      <legend id={legendId} className="mb-3 text-sm font-medium text-slate-700">
        {t("legend")}
      </legend>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value || "__any"}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors duration-200 focus-within:ring-2 focus-within:ring-[var(--brand-ring)]",
                selected
                  ? "border-[var(--action-strong)] bg-slate-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-[var(--action-soft)]",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => setValue(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--action-strong)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                <span className="block text-xs text-slate-500">{option.desc}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p id={hintId} className="mt-2 text-xs text-slate-500">
        {value ? t("hintTier") : t("hintAny")}
      </p>
      {paid.length === 0 && (
        <Link
          href={`/dashboard/${slug}/tiers`}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 underline decoration-slate-400 underline-offset-4 hover:decoration-slate-900"
        >
          {t("noPaidCta")}
          <Icon name="arrowRight" size={14} />
        </Link>
      )}
    </fieldset>
  );
}
