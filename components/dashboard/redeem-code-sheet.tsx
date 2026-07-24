"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { redeemPromoCodeAction, type RedeemCodeState } from "@/app/actions/plan";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Label } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";

const initial: RedeemCodeState = {};

/**
 * The redemption form itself — used inline inside the credits sheet and,
 * wrapped in a sheet, from every paywall. On success the page reloads so
 * previously locked areas simply appear.
 */
export function RedeemCodeForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(redeemPromoCodeAction, initial);
  const [code, setCode] = useState("");
  const inputId = useId();
  const t = useTranslations("dashboard.plans.redeem");
  const locale = useLocale();

  // Reload once the grant landed so every gated page re-renders unlocked.
  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(() => window.location.reload(), 2200);
    return () => clearTimeout(timer);
  }, [state.ok]);

  return (
    <>
      {state.ok ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <Icon name="check" size={26} />
          </span>
          <p className="text-lg font-bold text-slate-900">{t("successTitle")}</p>
          <p className="text-sm text-slate-500">
            {t("successText", { plan: state.planName ?? "" })}
          </p>
          <p className="text-xs text-slate-400">
            {state.expiresAt
              ? t("successUntil", {
                  date: new Date(state.expiresAt).toLocaleDateString(locale, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }),
                })
              : t("successLifetime")}
          </p>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="tenant" value={slug} />
          <FormError message={state.error} />

          <div>
            <Label htmlFor={inputId}>{t("label")}</Label>
            <input
              id={inputId}
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              placeholder={t("placeholder")}
              aria-describedby={`${inputId}-hint`}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center font-mono text-lg font-semibold uppercase tracking-[0.18em] text-slate-900 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]"
            />
            <p id={`${inputId}-hint`} className="mt-2 text-xs text-slate-400">
              {t("hint")}
            </p>
          </div>

          <button
            type="submit"
            disabled={pending || code.trim().length < 3}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? t("submitting") : t("submit")}
          </button>
        </form>
      )}
    </>
  );
}

/** Sheet wrapper used by the paywalls. */
export function RedeemCodeSheet({
  open,
  onClose,
  slug,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
}) {
  const t = useTranslations("dashboard.plans.redeem");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("title")}
      subtitle={t("subtitle")}
      icon="sparkles"
      variant="bottom"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-md px-5 py-6 sm:px-6">
          <RedeemCodeForm slug={slug} />
        </div>
      </div>
    </Sheet>
  );
}
