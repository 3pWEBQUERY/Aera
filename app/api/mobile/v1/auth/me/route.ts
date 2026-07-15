import prisma from "@/lib/prisma";
import { jsonOk, requireMobileAuth } from "@/lib/mobile/api";
import { communityCoverMap, toCommunityCard, toUserDto } from "@/lib/mobile/serializers";

// GET /api/mobile/v1/auth/me → { user, memberships: MembershipHome[] }

export async function GET(req: Request) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    orderBy: { joinedAt: "asc" },
    include: { tenant: true, tier: true },
  });
  const tenantIds = memberships.map((m) => m.tenantId);

  const [covers, memberCounts, stats, subs] = await Promise.all([
    communityCoverMap(tenantIds),
    tenantIds.length
      ? prisma.membership.groupBy({
          by: ["tenantId"],
          where: { tenantId: { in: tenantIds }, status: "ACTIVE" },
          _count: true,
        })
      : Promise.resolve([]),
    tenantIds.length
      ? prisma.memberStats.findMany({
          where: { userId: user.id, tenantId: { in: tenantIds } },
          select: { tenantId: true, points: true, levelName: true },
        })
      : Promise.resolve([]),
    tenantIds.length
      ? prisma.subscription.findMany({
          where: { userId: user.id, tenantId: { in: tenantIds } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const countMap = new Map<string, number>();
  for (const c of memberCounts) countMap.set(c.tenantId, c._count as number);
  const statsMap = new Map(stats.map((s) => [s.tenantId, s]));
  // Neueste Subscription je Tenant (Liste ist createdAt desc sortiert).
  const subMap = new Map<string, (typeof subs)[number]>();
  for (const s of subs) if (!subMap.has(s.tenantId)) subMap.set(s.tenantId, s);

  return jsonOk({
    user: toUserDto(user),
    memberships: memberships.map((m) => {
      const stat = statsMap.get(m.tenantId);
      const sub = subMap.get(m.tenantId) ?? null;
      return {
        community: toCommunityCard(m.tenant, {
          coverUrl: covers.get(m.tenantId) ?? null,
          memberCount: countMap.get(m.tenantId) ?? 0,
          isMember: m.status === "ACTIVE",
        }),
        tier: m.tier
          ? {
              name: m.tier.name,
              slug: m.tier.slug,
              priceCents: m.tier.priceCents,
              interval: m.tier.interval,
            }
          : null,
        role: m.role,
        points: stat?.points ?? 0,
        levelName: stat?.levelName ?? null,
        joinedAt: m.joinedAt.toISOString(),
        subscription: sub
          ? {
              status: sub.status,
              currentPeriodEnd: sub.currentPeriodEnd
                ? sub.currentPeriodEnd.toISOString()
                : null,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              isApple: Boolean(sub.appleOriginalTransactionId),
            }
          : null,
      };
    }),
  });
}
