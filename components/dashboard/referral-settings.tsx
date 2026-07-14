"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  updateReferralSettingsAction,
  type ReferralSettingsState,
} from "@/app/actions/referrals";
import { Input, Label } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";

const initial: ReferralSettingsState = {};

export function ReferralSettingsForm({
  slug,
  referralPercent,
}: {
  slug: string;
  referralPercent: number;
}) {
  const [state, action, pending] = useActionState(updateReferralSettingsAction, initial);
  const t = useTranslations("dashboard.referrals");

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="tenant" value={slug} />
      <div>
        <Label htmlFor="ref-percent">{t("percentLabel")}</Label>
        <Input
          id="ref-percent"
          name="referralPercent"
          type="number"
          min={0}
          max={50}
          step={0.5}
          defaultValue={referralPercent}
          className="w-32"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? t("saving") : t("save")}
      </button>
      {state.ok && !state.error && (
        <span className="text-sm text-emerald-600">{t("saved")}</span>
      )}
      {state.error && <FormError message={state.error} />}
    </form>
  );
}
