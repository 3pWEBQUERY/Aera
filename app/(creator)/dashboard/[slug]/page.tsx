import { requireTenantAdmin } from "@/lib/guards";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { formatPrice, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { PlannerUpcoming } from "@/components/dashboard/planner-upcoming";
import { PlanStatusCard } from "@/components/dashboard/plan-status-card";
import { limitsForPlan, nextPlanAfter, planAllowsFeature } from "@/lib/plan-features";
import { getOrCreateWallet } from "@/lib/credits";
import { PLATFORM_CURRENCY } from "@/lib/currency";
import { getCommunityCoverUrl } from "@/lib/tenant";
import { GettingStarted, type GettingStartedTask } from "@/components/dashboard/getting-started";

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

  const [
    members,
    posts,
    paidOrders,
    activeSubs,
    recentMembers,
    revenueAgg,
    wallet,
    spaceCount,
    coverUrl,
    firstWritableSpace,
  ] =
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
      getOrCreateWallet(t),
      prisma.space.count({ where: { tenantId: t, isArchived: false } }),
      getCommunityCoverUrl(t),
      // Where "write your first post" leads: the first space made for posts.
      prisma.space.findFirst({
        where: { tenantId: t, isArchived: false, type: { in: ["FEED", "FORUM", "BLOG"] } },
        orderBy: { sortOrder: "asc" },
        select: { slug: true },
      }),
    ]);

  const gettingStarted: GettingStartedTask[] = [
    {
      key: "post",
      done: posts > 0,
      href: firstWritableSpace
        ? `/dashboard/${slug}/spaces/${firstWritableSpace.slug}`
        : `/dashboard/${slug}/spaces`,
    },
    {
      key: "look",
      done: Boolean(coverUrl || tenant.logoUrl),
      href: `/dashboard/${slug}/settings?tab=branding`,
    },
    { key: "invite", done: members > 1, href: `/dashboard/${slug}/members` },
  ];
  const isNew = gettingStarted.some((task) => !task.done);

  const limits = limitsForPlan(wallet.plan);

  const revenue = revenueAgg._sum.amountCents ?? 0;

  const stats = [
    { label: td("overview.statMembers"), value: members },
    { label: td("overview.statActiveSubs"), value: activeSubs },
    { label: td("overview.statPosts"), value: posts },
    { label: td("overview.statPurchases"), value: paidOrders },
    { label: td("overview.statRevenue"), value: formatPrice(revenue, PLATFORM_CURRENCY, locale) },
  ];

  return (
    <div>
      <PageHeader
        title={td("overview.title")}
        subtitle={
          isNew
            ? td("overview.welcomeNew", { name: tenant.name })
            : td("overview.welcome", { name: tenant.name })
        }
      />
      <GettingStarted tasks={gettingStarted} communityHref={`/c/${slug}`} />
      <PlanStatusCard
        slug={slug}
        plan={wallet.plan}
        nextPlan={nextPlanAfter(wallet.plan)}
        planSource={wallet.planSource}
        promoExpiresAt={wallet.promoExpiresAt?.toISOString() ?? null}
        quotas={[
          { labelKey: "quotaSpaces", used: spaceCount, limit: limits.maxSpaces },
          { labelKey: "quotaMembers", used: members, limit: limits.maxMembers },
          {
            labelKey: "quotaCredits",
            used: Math.max(0, wallet.monthlyCredits - wallet.includedRemaining),
            limit: wallet.monthlyCredits,
            remaining: true,
          },
        ]}
      />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{s.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* The content planner is a paid feature; on Free its "create" link
          only led to a locked page. */}
      {planAllowsFeature(wallet.plan, "planner") && (
        <div className="mt-6">
          <PlannerUpcoming slug={slug} tenantId={t} />
        </div>
      )}

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
                      <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
                        <span className="truncate">{m.user.name}</span>
                        {m.status !== "ACTIVE" && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              m.status === "BANNED"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {td(`memberStatus.${m.status}`)}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {m.tier?.name ? `${m.tier.name} · ` : ""}
                        {td(`roles.${m.role}`)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">
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
