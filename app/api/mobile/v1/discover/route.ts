import prisma from "@/lib/prisma";
import { jsonOk, mobileAuth } from "@/lib/mobile/api";
import {
  communityCoverMap,
  discoverCategories,
  toCommunityCard,
  type CommunityCardDto,
} from "@/lib/mobile/serializers";
import type { Tenant } from "@/app/generated/prisma/client";

// GET /api/mobile/v1/discover → { categories, myCommunities, popular, newest }
// Token optional — personalisiert (isMember, myCommunities) wenn vorhanden.

type TenantWithCount = Tenant & { _count: { memberships: number } };

export async function GET(req: Request) {
  const user = await mobileAuth(req);

  const [popularRows, newestRows, myMemberships] = await Promise.all([
    prisma.tenant.findMany({
      include: { _count: { select: { memberships: true } } },
      orderBy: { memberships: { _count: "desc" } },
      take: 12,
    }),
    prisma.tenant.findMany({
      include: { _count: { select: { memberships: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    user
      ? prisma.membership.findMany({
          where: { userId: user.id, status: "ACTIVE" },
          orderBy: { joinedAt: "asc" },
          include: { tenant: { include: { _count: { select: { memberships: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  const myTenants = myMemberships.map((m) => m.tenant as TenantWithCount);
  const myIds = new Set(myTenants.map((t) => t.id));
  const allIds = [
    ...new Set([
      ...popularRows.map((t) => t.id),
      ...newestRows.map((t) => t.id),
      ...myTenants.map((t) => t.id),
    ]),
  ];
  const covers = await communityCoverMap(allIds);

  const card = (t: TenantWithCount): CommunityCardDto =>
    toCommunityCard(t, {
      coverUrl: covers.get(t.id) ?? null,
      memberCount: t._count.memberships,
      isMember: myIds.has(t.id),
    });

  return jsonOk({
    categories: discoverCategories(),
    myCommunities: myTenants.map(card),
    popular: popularRows.map((t) => card(t as TenantWithCount)),
    newest: newestRows.map((t) => card(t as TenantWithCount)),
  });
}
