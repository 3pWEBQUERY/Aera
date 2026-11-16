"use client";

import { startTransition, useState, useTransition } from "react";
import { useResilientActionState } from "@/components/forms/use-resilient-action-state";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cancelOwnMembershipAction, leaveCommunityAction } from "@/app/actions/subscription";
import type { ActionState } from "@/app/actions/dashboard";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/utils";

const initial: ActionState = {};

const SECONDARY_DANGER =
  "inline-flex min-h-9 items-center rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 " +
  "transition hover:border-red-400 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 " +
  "disabled:cursor-wait disabled:opacity-60";

/**
 * Mitgliedschaft beenden bzw. Abo kündigen — direkt auf der Karte im Konto.
 *
 * Die Logik dahinter (app/actions/subscription.ts):
 * - Kostenlos: Verlassen löscht die Mitgliedschaft und ihre Zugänge; gekaufte
 *   Inhalte bleiben.
 * - Bezahlt: Kündigen stoppt die Verlängerung, der Zugang bleibt bis zum Ende
 *   des bezahlten Zeitraums, danach bleibt die kostenlose Mitgliedschaft.
 *   Verlassen geht erst, wenn das Abo wirklich beendet ist.
 * - Inhaberin/Inhaber: kein Verlassen der eigenen Community.
 */
export function MembershipActions({
  slug,
  communityName,
  role,
  isPaid,
  cancelAtPeriodEnd,
  currentPeriodEnd,
}: {
  slug: string;
  communityName: string;
  role: string;
  isPaid: boolean;
  cancelAtPeriodEnd: boolean;
  /** ISO-Datum. */
  currentPeriodEnd: string | null;
}) {
  const t = useTranslations("account.membershipActions");
  const locale = useLocale();
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [leaveState, setLeaveState] = useState<ActionState>(initial);
  const [leaving, startLeaving] = useTransition();
  const [cancelState, cancel, cancelling] = useResilientActionState(cancelOwnMembershipAction, initial);

  if (role === "OWNER") {
    return <p className="text-xs text-[#161613]/65">{t("ownerNote")}</p>;
  }

  const until = currentPeriodEnd ? formatDate(currentPeriodEnd, locale) : null;
  const submit = (action: (fd: FormData) => void) => {
    const fd = new FormData();
    fd.set("tenant", slug);
    startTransition(() => action(fd));
  };

  async function onLeave() {
    const ok = await confirm({
      title: t("leaveTitle", { name: communityName }),
      body: t("leaveBody"),
      confirmLabel: t("leaveConfirm"),
      tone: "danger",
    });
    if (!ok) return;
    // Direkt aufrufen statt über useActionState: nach dem Verlassen
    // verschwindet diese Karte beim Neuladen, ein Effekt käme zu spät. Der
    // Hinweis „Du hast … verlassen“ steht danach oben auf der Seite.
    startLeaving(async () => {
      const fd = new FormData();
      fd.set("tenant", slug);
      const result = await leaveCommunityAction(initial, fd);
      if (!result.ok) {
        setLeaveState(result);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      params.set("left", slug);
      router.push(`/member/account?${params.toString()}`);
    });
  }

  async function onCancel() {
    const ok = await confirm({
      title: t("cancelTitle", { name: communityName }),
      body: until ? t("cancelBodyUntil", { date: until }) : t("cancelBodyNow"),
      confirmLabel: t("cancelConfirm"),
      tone: "danger",
    });
    if (ok) submit(cancel);
  }

  const cancelled = cancelAtPeriodEnd || cancelState.ok;
  const error = leaveState.error ?? cancelState.error;

  return (
    <>
      {isPaid && !cancelled && (
        <button type="button" onClick={onCancel} disabled={cancelling} className={SECONDARY_DANGER}>
          {cancelling ? t("cancelling") : t("cancelCta")}
        </button>
      )}
      {!isPaid && (
        <button type="button" onClick={onLeave} disabled={leaving} className={SECONDARY_DANGER}>
          {leaving ? t("leaving") : t("leaveCta")}
        </button>
      )}
      <p role="status" className="basis-full text-xs leading-5 text-[#161613]/70">
        {isPaid && cancelled ? (until ? t("cancelledUntil", { date: until }) : t("cancelledNow")) : ""}
      </p>
      {error && (
        <p role="alert" className="basis-full text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      {confirmDialog}
    </>
  );
}
