"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  cancelOwnMembershipAction,
  leaveOwnCommunityAction,
} from "@/app/actions/subscription";
import type { ActionState } from "@/app/actions/dashboard";
import { Icon } from "./icons";
import { Pill, FormError } from "@/components/ui/misc";
import { formatDate, formatPrice } from "@/lib/utils";

export interface MySubscriptionData {
  tenantName: string;
  role: string;
  memberSince: string; // ISO
  tierName: string | null;
  priceCents: number;
  currency: string;
  interval: string; // FREE | MONTH | YEAR
  subStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null; // ISO
}

const initial: ActionState = {};

/** Full-screen sheet content: manage & cancel your own membership. */
export function MySubscription({
  slug,
  data,
}: {
  slug: string;
  data: MySubscriptionData;
}) {
  const [state, cancelAction, pending] = useActionState(cancelOwnMembershipAction, initial);
  const [leaving, setLeaving] = useState(false);
  const t = useTranslations("dashboard.subscription");
  const tSafety = useTranslations("billingSafety");
  const tRoles = useTranslations("dashboard.roles");
  const locale = useLocale();
  const intervalSuffix =
    data.interval === "MONTH" ? t("perMonth") : data.interval === "YEAR" ? t("perYear") : "";

  const isOwner = data.role === "OWNER";
  const isPaid = data.priceCents > 0;
  const cancelled = data.cancelAtPeriodEnd || state.ok;

  const status =
    cancelled && data.currentPeriodEnd
      ? { label: t("endsOn", { date: formatDate(data.currentPeriodEnd, locale) }), cls: "bg-amber-100 text-amber-700" }
      : cancelled
        ? { label: t("cancelled"), cls: "bg-amber-100 text-amber-700" }
        : { label: t("active"), cls: "bg-green-100 text-green-700" };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
        {/* Current plan */}
        <section className="rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                <Icon name="tiers" size={20} />
              </span>
              <div>
                <p className="font-semibold text-slate-900">
                  {data.tierName ?? t("freeMembership")}
                </p>
                <p className="text-sm text-slate-500">{data.tenantName}</p>
              </div>
            </div>
            <Pill className={status.cls}>{status.label}</Pill>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
            <div>
              <dt className="text-xs text-slate-400">{t("price")}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                {isPaid
                  ? `${formatPrice(data.priceCents, data.currency, locale)} ${intervalSuffix}`
                  : t("free")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">{t("memberSince")}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                {formatDate(data.memberSince, locale)}
              </dd>
            </div>
            {isPaid && data.currentPeriodEnd && (
              <div>
                <dt className="text-xs text-slate-400">
                  {cancelled ? t("accessUntil") : t("nextRenewal")}
                </dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {formatDate(data.currentPeriodEnd, locale)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-400">{t("role")}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                {tRoles(data.role)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Change plan */}
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-slate-900">{t("switchTitle")}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              {t("switchText")}
            </p>
          </div>
          <Link
            href={`/c/${slug}/join`}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:self-auto"
          >
            {t("viewPlans")}
            <Icon name="external" size={15} className="text-slate-400" />
          </Link>
        </section>

        {state.ok && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {data.currentPeriodEnd ? t("cancelledNoticeUntil") : t("cancelledNotice")}
          </p>
        )}
        <FormError message={state.error} />

        {/* Cancel / leave */}
        {isOwner ? (
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            {t.rich("ownerNote", { b: (chunks) => <span className="font-medium">{chunks}</span> })}
          </section>
        ) : (
          <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5">
            <p className="font-medium text-red-700">
              {isPaid ? t("cancelTitle") : t("leaveTitle")}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {isPaid ? t("cancelText") : t("leaveText")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {isPaid && !cancelled && (
                <form
                  action={cancelAction}
                  onSubmit={(e) => {
                    if (!confirm(t("confirmCancel"))) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="tenant" value={slug} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {pending ? t("cancelling") : t("cancelNow")}
                  </button>
                </form>
              )}
              {!isPaid && (
                <form
                  action={leaveOwnCommunityAction}
                  onSubmit={(e) => {
                    if (!confirm(t("confirmLeave", { name: data.tenantName }))) {
                      e.preventDefault();
                    } else {
                      setLeaving(true);
                    }
                  }}
                >
                  <input type="hidden" name="tenant" value={slug} />
                  <button
                    type="submit"
                    disabled={leaving}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <Icon name="logout" size={15} />
                    {leaving ? t("leaving") : t("leaveCommunity")}
                  </button>
                </form>
              )}
            </div>
            {isPaid && (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {tSafety("leaveAfterPaidEnds")}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
