import { requireTenantAdmin } from "@/lib/guards";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { formatPrice, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { PlannerUpcoming } from "@/components/dashboard/planner-upcoming";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  const t = tenant.id;
  const td = await getTranslations("dashboard");
  const locale = await getLocale();

  const [members, posts, paidOrders, activeSubs, recentMembers, revenueAgg] =
    await Promise.all([
      prisma.membership.count({ where: { tenantId: t, status: "ACTIVE" } }),
      prisma.post.count({ where: { tenantId: t } }),
      prisma.order.count({ where: { tenantId: t, status: "PAID" } }),
      prisma.subscription.count({ where: { tenantId: t, status: "ACTIVE" } }),
      prisma.membership.findMany({
        where: { tenantId: t },
        orderBy: { joinedAt: "desc" },
        take: 6,
        include: { user: { select: { name: true, avatarUrl: true } }, tier: true },
      }),
      prisma.order.aggregate({
        where: { tenantId: t, status: "PAID" },
        _sum: { amountCents: true },
      }),
    ]);

  const revenue = revenueAgg._sum.amountCents ?? 0;

  const stats = [
    { label: td("overview.statMembers"), value: members },
    { label: td("overview.statActiveSubs"), value: activeSubs },
    { label: td("overview.statPosts"), value: posts },
    { label: td("overview.statPurchases"), value: paidOrders },
    { label: td("overview.statRevenue"), value: formatPrice(revenue, "eur", locale) },
  ];

  return (
    <div>
      <PageHeader
        title={td("overview.title")}
        subtitle={td("overview.welcome", { name: tenant.name })}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{s.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <PlannerUpcoming slug={slug} tenantId={t} />
      </div>

      <div className="mt-6">
        <Card>
          <CardBody>
            <h2 className="font-semibold text-slate-900">{td("overview.recentMembers")}</h2>
            {recentMembers.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                {td("overview.noMembers")}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {recentMembers.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <Avatar name={m.user.name} src={m.user.avatarUrl} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {m.user.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {m.tier?.name ?? "—"} · {td(`roles.${m.role}`)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {timeAgo(m.joinedAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
