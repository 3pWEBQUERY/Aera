import Link from "next/link";
import { requireTenantAdmin } from "@/lib/guards";
import { hasPlatformAdminAccess } from "@/lib/platform-admin";
import { getTranslations, getLocale } from "next-intl/server";
import prisma, { withTenantTransactionFor } from "@/lib/prisma";
import { features } from "@/lib/env";
import { getConnectStatus, createDashboardLoginLink } from "@/lib/stripe";
import { Card, CardBody } from "@/components/ui/card";
import { Pill } from "@/components/ui/misc";
import { Popover } from "@/components/ui/popover";
import { Icon } from "@/components/dashboard/icons";
import { formatDate } from "@/lib/utils";
import { PLATFORM_CURRENCY } from "@/lib/currency";

const statusColor: Record<string, string> = {
  PAID: "bg-green-100 text-green-700",
  PENDING: "bg-amber-100 text-amber-700",
  REFUNDED: "bg-slate-100 text-slate-600",
  FAILED: "bg-red-100 text-red-700",
};

export default async function PayoutsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, role, user } = await requireTenantAdmin(slug);
  const isPlatformAdmin = hasPlatformAdminAccess(user);
  const t = tenant.id;
  const td = await getTranslations("dashboard.payouts");
  const tStatus = await getTranslations("dashboard.orderStatus");
  const locale = await getLocale();

  const [gross, fees, activeSubs, recent, paidOrders, creditPurchases, monthlyFees] =
    await Promise.all([
      prisma.order.aggregate({
        where: { tenantId: t, status: "PAID" },
        _sum: { amountCents: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { tenantId: t, status: "PAID" },
        _sum: { platformFeeCents: true },
      }),
      prisma.subscription.count({ where: { tenantId: t, status: "ACTIVE" } }),
      prisma.order.findMany({
        where: { tenantId: t },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.order.findMany({
        where: { tenantId: t, status: "PAID" },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.aiCreditPurchase.findMany({
        where: { tenantId: t, priceCents: { gt: 0 }, refundedAt: null },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      withTenantTransactionFor(t, (tx) =>
        tx.$queryRaw<{ month: Date; feeCents: number }[]>`
          SELECT date_trunc('month', "createdAt") AS month,
                 SUM("platformFeeCents")::int AS "feeCents"
          FROM "Order"
          WHERE "tenantId" = ${t}
            AND "status"::text = 'PAID'
            AND "platformFeeCents" > 0
          GROUP BY 1
          ORDER BY 1 DESC
          LIMIT 6
        `,
      ),
    ]);

  const grossCents = gross._sum.amountCents ?? 0;
  const feeCents = fees._sum.platformFeeCents ?? 0;
  const netCents = grossCents - feeCents;
  const count = gross._count;
  const avgCents = count ? Math.round(grossCents / count) : 0;

  // Numeric currency formatter — shows 0 as "0,00" in the platform currency
  // (never "Kostenlos"), which is what financial breakdowns and receipts need.
  const money = (cents: number, currency: string = PLATFORM_CURRENCY) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  const monthName = (d: Date | string) =>
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
      new Date(d),
    );

  // Live Stripe payout status for the connected account (if any).
  const stripeStatus =
    features.stripe && tenant.stripeAccountId
      ? await getConnectStatus(tenant.stripeAccountId)
      : null;
  const stripeLoginUrl =
    role === "OWNER" && stripeStatus?.chargesEnabled && tenant.stripeAccountId
      ? await createDashboardLoginLink(tenant.stripeAccountId)
      : null;
  const payoutsEnabled = !!stripeStatus?.payoutsEnabled;
  const settingsHref = `/dashboard/${slug}/settings?tab=integrations`;

  const stats = [
    { label: td("statGross"), value: money(grossCents), hint: td("statGrossHint", { count }) },
    { label: td("statEarnings"), value: money(netCents), hint: td("statEarningsHint") },
    { label: td("statAvg"), value: count ? money(avgCents) : "—", hint: td("statAvgHint") },
    { label: td("statSubs"), value: String(activeSubs), hint: td("statSubsHint") },
  ];

  // ---- Auszahlungen (payouts) popover -----------------------------------
  const payoutPopover = (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{td("payoutTitle")}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{td("payoutIntro")}</p>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">{td("rowGross")}</dt>
          <dd className="font-medium text-slate-800">{money(grossCents)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">
            {td("rowFee", { percent: tenant.platformFeePercent })}
          </dt>
          <dd className="font-medium text-slate-500">−{money(feeCents)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <dt className="font-semibold text-slate-900">{td("rowNet")}</dt>
          <dd className="text-base font-bold text-slate-900">{money(netCents)}</dd>
        </div>
      </dl>

      {!features.stripe ? (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          {td("payoutDevNote")}
        </p>
      ) : !tenant.stripeAccountId ? (
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-600">{td("payoutConnectNote")}</p>
          <Link
            href={settingsHref}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:underline"
          >
            {td("toSettings")}
            <Icon name="arrowRight" size={14} />
          </Link>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${payoutsEnabled ? "bg-green-500" : "bg-amber-500"}`}
            />
            <span className="text-xs font-semibold text-slate-700">
              {payoutsEnabled ? td("payoutReady") : td("payoutPending")}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {payoutsEnabled ? td("payoutReadyNote") : td("payoutPendingNote")}
          </p>
          {stripeLoginUrl ? (
            <a
              href={stripeLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              <Icon name="external" size={14} />
              {td("openStripe")}
            </a>
          ) : (
            <Link
              href={settingsHref}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:underline"
            >
              {td("toSettings")}
              <Icon name="arrowRight" size={14} />
            </Link>
          )}
        </div>
      )}
    </div>
  );

  // ---- Rechnungen (invoices) popover ------------------------------------
  const invoicePopover = (
    <div className="space-y-4">
      <section>
        <h3 className="text-sm font-semibold text-slate-900">{td("invoicesFromAera")}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{td("invoicesFromAeraHint")}</p>
        {monthlyFees.length === 0 && creditPurchases.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">{td("invoicesEmpty")}</p>
        ) : (
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
            {monthlyFees.map((m) => (
              <li
                key={`fee-${new Date(m.month).toISOString()}`}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-700">
                    {td("invoiceFee")}
                  </p>
                  <p className="text-[11px] capitalize text-slate-400">{monthName(m.month)}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-slate-800">
                  {money(m.feeCents)}
                </span>
              </li>
            ))}
            {creditPurchases.map((p) => (
              <li
                key={`credit-${p.id}`}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-700">
                    {td("invoiceCredits", { credits: p.credits.toLocaleString(locale) })}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {formatDate(p.createdAt, locale)} · {td("refNo", { id: p.id.slice(-8).toUpperCase() })}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-slate-800">
                  {money(p.priceCents, p.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-slate-100 pt-3">
        <h3 className="text-sm font-semibold text-slate-900">{td("receiptsTitle")}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{td("receiptsHint")}</p>
        {paidOrders.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">{td("receiptsEmpty")}</p>
        ) : (
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
            {paidOrders.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-700">{o.description}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatDate(o.createdAt, locale)} · {td("refNo", { id: o.id.slice(-8).toUpperCase() })}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-slate-800">
                  {money(o.amountCents, o.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{td("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{td("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover label={td("payoutsPopover")} icon="payouts">
            {payoutPopover}
          </Popover>
          <Popover label={td("invoicesPopover")} icon="creditCard" width="w-96">
            {invoicePopover}
          </Popover>
        </div>
      </div>

      {!features.stripe && isPlatformAdmin && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {td.rich("stripeWarning", { b: (c) => <strong>{c}</strong> })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {s.label}
              </p>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="mt-0.5 text-xs text-slate-400">{s.hint}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <Card>
          <CardBody className="p-0">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="font-semibold text-slate-900">{td("recentTitle")}</h2>
            </div>
            {recent.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                {td("noTransactions")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">{td("colCustomer")}</th>
                    <th className="px-5 py-2.5 font-medium">{td("colDescription")}</th>
                    <th className="px-5 py-2.5 font-medium">{td("colDate")}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{td("colAmount")}</th>
                    <th className="px-5 py-2.5 font-medium">{td("colStatus")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.map((o) => (
                    <tr key={o.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{o.user.name}</p>
                        <p className="text-xs text-slate-400">{o.user.email}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{o.description}</td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(o.createdAt, locale)}</td>
                      <td className="px-5 py-3 text-right font-medium text-slate-800">
                        {money(o.amountCents, o.currency)}
                      </td>
                      <td className="px-5 py-3">
                        <Pill className={statusColor[o.status]}>{tStatus(o.status)}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
