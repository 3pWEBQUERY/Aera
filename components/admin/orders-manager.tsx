"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  adminUpdateOrderAction,
  adminDeleteOrderAction,
  type AdminState,
} from "@/app/actions/admin";
import { Sheet } from "@/components/dashboard/sheet";
import { Icon } from "@/components/dashboard/icons";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";
import { Label, Select } from "@/components/ui/field";
import { formatDateTime, formatPrice } from "@/lib/utils";
import { PLATFORM_CURRENCY } from "@/lib/currency";

export interface OrderRowData {
  id: string;
  description: string;
  amountCents: number;
  currency: string;
  status: string;
  fulfilled: boolean;
  stripeSessionId: string | null;
  createdAt: string;
  tenantName: string;
  tenantSlug: string;
  userName: string;
  userEmail: string;
}

const initial: AdminState = {};

const statusCls: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  REFUNDED: "bg-slate-100 text-slate-600",
  FAILED: "bg-red-100 text-red-700",
};
const statusKey: Record<string, string> = {
  PENDING: "statusPending",
  PAID: "statusPaid",
  REFUNDED: "statusRefunded",
  FAILED: "statusFailed",
};

export function OrdersManager({
  rows,
  total,
  q,
  stats,
}: {
  rows: OrderRowData[];
  total: number;
  q: string;
  stats: { total: number; paidAmountCents: number; paidFeeCents: number };
}) {
  const [editing, setEditing] = useState<OrderRowData | null>(null);
  const t = useTranslations("admin.orders");
  const tc = useTranslations("admin");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          {t("title")}
          <Pill className="bg-slate-100 text-slate-500">{nf.format(total)}</Pill>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-2xl font-bold leading-none text-slate-900">
            {nf.format(stats.total)}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">{t("totalOrders")}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-2xl font-bold leading-none text-slate-900">
            {formatPrice(stats.paidAmountCents, PLATFORM_CURRENCY, locale)}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">{t("revenuePaid")}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-2xl font-bold leading-none text-slate-900">
            {formatPrice(stats.paidFeeCents, PLATFORM_CURRENCY, locale)}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            {t("feesPaid")}
          </p>
        </div>
      </div>

      <form method="GET" action="/admin/orders" className="max-w-md">
        <div className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 transition focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
          <Icon name="search" size={17} className="shrink-0 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-slate-900 px-3.5 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          >
            {tc("search")}
          </button>
        </div>
      </form>

      <div className="space-y-2.5">
        {rows.length === 0 ? (
          <EmptyState
            icon="payouts"
            title={q ? tc("noResults") : t("emptyTitle")}
            hint={q ? t("noResultsHint", { q }) : t("emptyHint")}
          />
        ) : (
          rows.map((o) => {
            const statusClsVal = statusCls[o.status] ?? statusCls.PENDING;
            const statusLabel = t(statusKey[o.status] ?? "statusPending");
            return (
              <div
                key={o.id}
                onClick={() => setEditing(o)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditing(o);
                  }
                }}
                className="group flex cursor-pointer flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] sm:flex-nowrap sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{o.description}</p>
                    <Pill className={statusClsVal}>{statusLabel}</Pill>
                    {o.fulfilled && (
                      <Pill className="bg-blue-100 text-blue-700">{t("fulfilledBadge")}</Pill>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-400">
                    {t("metaLine", { tenant: o.tenantName, email: o.userEmail, date: formatDateTime(o.createdAt, locale) })}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-slate-900">
                  {formatPrice(o.amountCents, o.currency, locale)}
                </p>
                <span className="flex w-full items-center justify-end gap-1.5 border-t border-slate-100 pt-2.5 text-sm font-medium text-slate-500 sm:w-auto sm:rounded-lg sm:border-0 sm:px-3 sm:py-1.5 sm:pt-0 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                  <Icon name="settings" size={16} />
                  {tc("edit")}
                </span>
              </div>
            );
          })
        )}
      </div>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("editTitle")}
        subtitle={editing?.description}
        icon="payouts"
      >
        {editing && (
          <EditForm key={editing.id} order={editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-slate-400">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-sm font-medium text-slate-800 ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function EditForm({ order, onDone }: { order: OrderRowData; onDone: () => void }) {
  const [state, action, pending] = useActionState(adminUpdateOrderAction, initial);
  const t = useTranslations("admin.orders");
  const tc = useTranslations("admin");
  const locale = useLocale();
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const formId = "admin-order-edit";

  async function handleDelete(fd: FormData) {
    await adminDeleteOrderAction(fd);
    onDone();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-10">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <InfoRow label={t("description")} value={order.description} />
            <InfoRow label={t("community")} value={`${order.tenantName} (/c/${order.tenantSlug})`} />
            <InfoRow label={t("buyer")} value={`${order.userName} · ${order.userEmail}`} />
            <InfoRow label={t("amount")} value={formatPrice(order.amountCents, order.currency, locale)} />
            <InfoRow label={t("created")} value={formatDateTime(order.createdAt, locale)} />
            {order.stripeSessionId && (
              <InfoRow label={t("stripeSession")} value={order.stripeSessionId} mono />
            )}
          </div>

          <FormError message={state.error} />

          <form id={formId} action={action} className="space-y-5">
            <input type="hidden" name="orderId" value={order.id} />
            <div>
              <Label htmlFor="ao-status">{t("status")}</Label>
              <Select id="ao-status" name="status" defaultValue={order.status}>
                <option value="PENDING">{t("statusPending")}</option>
                <option value="PAID">{t("statusPaid")}</option>
                <option value="REFUNDED">{t("statusRefunded")}</option>
                <option value="FAILED">{t("statusFailed")}</option>
              </Select>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3.5 py-3 transition hover:bg-slate-50">
              <input
                type="checkbox"
                name="fulfilled"
                defaultChecked={order.fulfilled}
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800">{t("fulfilled")}</span>
                <span className="block text-xs text-slate-400">
                  {t("fulfilledHint")}
                </span>
              </span>
            </label>
          </form>

          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
              <Icon name="alert" size={15} />
              {tc("dangerZone")}
            </p>
            <p className="mt-1 text-xs text-red-600/90">
              {t("dangerDesc")}
            </p>
            <form
              action={handleDelete}
              onSubmit={(e) => {
                if (!window.confirm(t("deleteConfirm"))) {
                  e.preventDefault();
                }
              }}
              className="mt-3"
            >
              <input type="hidden" name="orderId" value={order.id} />
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                {t("deleteBtn")}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {tc("cancel")}
        </button>
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? tc("saving") : tc("saveChanges")}
        </button>
      </div>
    </div>
  );
}
