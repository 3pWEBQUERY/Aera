"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { testStripeAction, type TestResult } from "@/app/actions/integration-test";
import { Icon } from "./icons";
import { cn } from "@/lib/utils";

const initial: TestResult = {};

export function StripeConnectionTest({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(testStripeAction, initial);
  const t = useTranslations("dashboard.settings.stripeTest");
  return (
    <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
      <input type="hidden" name="tenant" value={slug} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        <Icon name="payouts" size={16} className="text-slate-400" />
        {pending ? t("testing") : t("testButton")}
      </button>
      {state.message && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-medium",
            state.ok ? "text-emerald-600" : "text-red-600",
          )}
        >
          <Icon name={state.ok ? "check" : "alert"} size={15} />
          {state.message}
        </span>
      )}
    </form>
  );
}
