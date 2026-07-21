"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { tipAction } from "@/app/actions/tips";
import { PLATFORM_CURRENCY } from "@/lib/currency";
import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = [3, 5, 10, 20];

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-xl bg-[#161613] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#33332e] disabled:opacity-50"
    >
      <Icon name="heart" size={15} /> {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * Member-facing tip form: quick-amount chips (platform currency), free
 * amount, optional message and an "anonymous" toggle (isPublic=false keeps
 * the tip off the public wall).
 */
export function TipForm({ slug, space }: { slug: string; space: string }) {
  const t = useTranslations("community.render.tips");
  const locale = useLocale();
  const [amount, setAmount] = useState("5.00");
  const [anonymous, setAnonymous] = useState(false);
  const currency = PLATFORM_CURRENCY.toUpperCase();
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  });
  return (
    <form action={tipAction} className="mb-6 rounded-2xl border border-[#161613]/10 bg-white p-5">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="space" value={space} />
      <input type="hidden" name="isPublic" value={anonymous ? "false" : "true"} />
      <div className="flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setAmount(n.toFixed(2))}
            className={cn(
              "rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition",
              amount === n.toFixed(2)
                ? "border-[#161613] bg-[#161613] text-white"
                : "border-[#161613]/15 text-[#161613]/70 hover:border-[#161613]/40",
            )}
          >
            {fmt.format(n)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-[#161613]/60">
            {t("amountLabel")} ({currency})
          </label>
          <input
            name="amount"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-[#161613]/15 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
        </div>
        <SubmitButton label={t("send")} pendingLabel={t("sending")} />
      </div>
      <input
        name="message"
        maxLength={280}
        placeholder={t("messagePlaceholder")}
        className="mt-3 w-full rounded-xl border border-[#161613]/15 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none"
      />
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-[#161613]/70">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="h-4 w-4 rounded border-[#161613]/30 accent-[#161613]"
        />
        {t("anonymous")}
      </label>
    </form>
  );
}
