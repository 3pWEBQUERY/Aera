"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setMemberBanAction } from "@/app/actions/dashboard";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FormError } from "@/components/ui/misc";
import { formatPrice, cn } from "@/lib/utils";
import { Icon } from "./icons";

/** Laufendes, bezahltes Abo eines Mitglieds — wird beim Sperren gekündigt. */
export interface MemberSubscriptionInfo {
  tierName: string;
  priceCents: number;
  currency: string;
  interval: string;
}

/**
 * „Mitglied sperren“ bzw. „Sperre aufheben“ — ein eigener Knopf statt einer
 * Option im Status-Feld. Vor dem Sperren steht eine Rückfrage, die die Folgen
 * nennt: Zugang weg, und ein bezahltes Abo wird gekündigt.
 *
 * Wird in der Mitgliederverwaltung und in der Moderation verwendet.
 */
export function BanMemberButton({
  slug,
  membershipId,
  name,
  community,
  banned,
  subscription,
  onDone,
  size = "md",
  label,
}: {
  slug: string;
  membershipId: string;
  name: string;
  community: string;
  banned: boolean;
  subscription: MemberSubscriptionInfo | null;
  onDone?: () => void;
  size?: "sm" | "md";
  /** Sichtbarer Text; Standard „Mitglied sperren“ / „Sperre aufheben“. */
  label?: string;
}) {
  const t = useTranslations("dashboard.members");
  const locale = useLocale();
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  function priceText(s: MemberSubscriptionInfo) {
    const price = formatPrice(s.priceCents, s.currency, locale);
    if (s.interval === "MONTH") return t("pricePerMonth", { price });
    if (s.interval === "YEAR") return t("pricePerYear", { price });
    return price;
  }

  async function run() {
    if (busy) return;
    if (!banned) {
      const ok = await confirm({
        title: t("banTitle", { name }),
        body: (
          <>
            {t("banBody", { name, community })}
            {subscription && (
              <>
                {" "}
                {t("banBodySubscription", {
                  membership: subscription.tierName,
                  price: priceText(subscription),
                })}
              </>
            )}
          </>
        ),
        confirmLabel: t("banConfirm"),
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(undefined);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("membershipId", membershipId);
    fd.set("ban", banned ? "0" : "1");
    const result = await setMemberBanAction(fd);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onDone?.();
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => void run()}
        aria-disabled={busy}
        className={cn(
          "inline-flex items-center gap-2 font-medium transition aria-disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
          size === "sm" ? "rounded-full px-4 py-1.5 text-sm" : "rounded-xl px-4 py-2.5 text-sm",
          banned
            ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
            : "border border-red-200 text-red-700 hover:bg-red-50",
        )}
      >
        <Icon name="lock" size={16} />
        {busy
          ? banned
            ? t("unbanning")
            : t("banning")
          : (label ?? (banned ? t("unban") : t("ban")))}
      </button>
      <FormError message={error} />
      {confirmDialog}
    </div>
  );
}
