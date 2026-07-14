"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveTipGoalAction, type ActionState } from "@/app/actions/tips";
import { Icon } from "./icons";
import { Input, Label } from "@/components/ui/field";
import { FormError, EmptyState } from "@/components/ui/misc";

export interface TipRow {
  id: string;
  userName: string;
  amountCents: number;
  currency: string;
  message: string | null;
  createdAt: string;
}

interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

function euro(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export function TipsManager({
  slug,
  space,
  tips,
  totalCents,
  goalCents,
  currency,
}: {
  slug: string;
  space: SpaceInfo;
  tips: TipRow[];
  totalCents: number;
  goalCents: number;
  currency: string;
}) {
  const t = useTranslations("dashboard.tips");
  const [state, action, pending] = useActionState(saveTipGoalAction, initial);

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t("totalLabel")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{euro(totalCents, currency)}</p>
        </div>
        <form action={action} className="rounded-2xl border border-slate-200 bg-white p-5">
          <input type="hidden" name="tenant" value={slug} />
          <input type="hidden" name="spaceId" value={space.id} />
          <FormError message={state.error} />
          <Label htmlFor="tip-goal">{t("goalLabel")}</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input id="tip-goal" name="goal" inputMode="decimal" defaultValue={goalCents > 0 ? (goalCents / 100).toFixed(2) : ""} placeholder="500,00" />
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? t("saving") : t("save")}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">{t("goalHint")}</p>
        </form>
      </div>

      {tips.length === 0 ? (
        <EmptyState icon="heart" title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <div className="space-y-2">
          {tips.map((tp) => (
            <div key={tp.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{tp.userName}</p>
                {tp.message && <p className="truncate text-xs text-slate-500">{tp.message}</p>}
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Icon name="heart" size={14} /> {euro(tp.amountCents, tp.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
