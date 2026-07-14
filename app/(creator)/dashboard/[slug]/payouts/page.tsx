import { requireTenantAdmin } from "@/lib/guards";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { features } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Pill } from "@/components/ui/misc";
import { formatPrice, formatDate } from "@/lib/utils";

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
  const { tenant } = await requireTenantAdmin(slug);
  const t = tenant.id;
  const td = await getTranslations("dashboard.payouts");
  const tStatus = await getTranslations("dashboard.orderStatus");
  const locale = await getLocale();

  const [gross, fees, activeSubs, recent] = await Promise.all([
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
  ]);

  const grossCents = gross._sum.amountCents ?? 0;
  const feeCents = fees._sum.platformFeeCents ?? 0;
  const netCents = grossCents - feeCents;

  const stats = [
    { label: td("statGross"), value: formatPrice(grossCents, "eur", locale), hint: td("statGrossHint", { count: gross._count }) },
    { label: td("statFee"), value: formatPrice(feeCents, "eur", locale), hint: td("statFeeHint", { percent: tenant.platformFeePercent }) },
    { label: td("statNet"), value: formatPrice(netCents, "eur", locale), hint: td("statNetHint") },
    { label: td("statSubs"), value: String(activeSubs), hint: td("statSubsHint") },
  ];

  return (
    <div>
      <PageHeader title={td("title")} subtitle={td("subtitle")} />

      {!features.stripe && (
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
                        {formatPrice(o.amountCents, o.currency, locale)}
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
