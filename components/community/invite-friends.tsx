"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";

/** Karte „Freunde einladen" mit persönlichem Referral-Link (Copy-Button). */
export function InviteFriends({ inviteUrl }: { inviteUrl: string }) {
  const t = useTranslations("community.invite");
  const tCommon = useTranslations("common");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-6 rounded-2xl border border-[var(--brand-ring,#e2e8f0)] bg-[var(--brand-soft,#f8fafc)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          <Icon name="megaphone" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{t("title")}</p>
          <p className="text-xs text-slate-500">{t("text")}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-200 sm:max-w-72">
            {inviteUrl}
          </code>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-xl bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
          >
            {copied ? tCommon("copied") : tCommon("copy")}
          </button>
        </div>
      </div>
    </div>
  );
}
