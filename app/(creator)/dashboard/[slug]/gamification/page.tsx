import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { leaderboard } from "@/lib/gamification";
import {
  GamificationManager,
  type RuleData,
  type BadgeData,
} from "@/components/dashboard/gamification-manager";

export default async function GamificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const { tenant } = await requireTenantAdmin(slug);
  const [rulesRaw, badgesRaw, board] = await Promise.all([
    prisma.gamificationRule.findMany({
      where: { tenantId: tenant.id },
      orderBy: { trigger: "asc" },
    }),
    prisma.badge.findMany({
      where: { tenantId: tenant.id },
      include: { _count: { select: { awards: true } } },
    }),
    leaderboard(tenant.id, 10),
  ]);

  const rules: RuleData[] = rulesRaw.map((r) => ({
    id: r.id,
    name: r.name,
    trigger: r.trigger,
    points: r.points,
    maxPerDay: r.maxPerDay,
  }));
  const badges: BadgeData[] = badgesRaw.map((b) => {
    const c = (b.criteria ?? {}) as { type?: string; threshold?: number };
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      type: c.type ?? "points",
      threshold: Number(c.threshold ?? 0),
      awardCount: b._count.awards,
    };
  });

  return (
    <GamificationManager
      slug={slug}
      rules={rules}
      badges={badges}
      leaderboard={board}
      initialTab={tab}
    />
  );
}
