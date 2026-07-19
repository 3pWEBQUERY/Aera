"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CreditsSheet } from "./credits-sheet";
import { Icon } from "./icons";

export function FreePlanUpgradeBanner({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("dashboard.overview.upgrade");

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute inset-y-0 left-0 w-1 bg-[var(--brand)]" aria-hidden="true" />
        <div className="flex flex-col gap-5 px-5 py-5 pl-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pl-7">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
              <Icon name="tiers" size={20} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{t("title")}</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {t("badge")}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{t("description")}</p>
              <p className="mt-2 text-xs font-medium text-slate-400">{t("plans")}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2 sm:self-center"
          >
            {t("cta")}
            <Icon name="chevron" size={15} className="-rotate-90" />
          </button>
        </div>
      </section>

      <CreditsSheet
        open={open}
        onClose={() => setOpen(false)}
        slug={slug}
        focusPlans
      />
    </>
  );
}
