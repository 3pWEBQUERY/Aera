import prisma from "@/lib/prisma";
import { CATEGORIES, isValidCategory } from "@/lib/categories";
import { jsonOk, mobileAuth } from "@/lib/mobile/api";
import {
  communityCoverMap,
  discoverCategories,
  toCommunityCard,
  type CommunityCardDto,
} from "@/lib/mobile/serializers";
import type { Tenant } from "@/app/generated/prisma/client";

// GET /api/mobile/v1/discover
//   → { categories, topics, topCreators, myCommunities, popular, newest }
// Token optional — personalisiert (isMember, myCommunities) wenn vorhanden.
// topics/topCreators spiegeln die Web-Discover-Seite (app/home/page.tsx):
// „Themen entdecken"-Kacheln + „Top-Kreative" je genutzter Kategorie.

type TenantWithCount = Tenant & { _count: { memberships: number } };

/** Kategorien, die tatsächlich von Communities genutzt werden (key → Anzahl). */
async function categoriesInUse(): Promise<Map<string, number>> {
  try {
    const rows = await prisma.tenant.groupBy({
      by: ["category"],
      _count: { _all: true },
      where: { category: { not: null } },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.category && isValidCategory(r.category)) {
        map.set(r.category, r._count._all);
      }
    }
    return map;
  } catch {
    // Spalte noch nicht migriert — Kategorie-Sektionen ausblenden statt crashen.
    return new Map();
  }
}

export async function GET(req: Request) {
  const user = await mobileAuth(req);

  const [popularRows, newestRows, myMemberships, ownedCount] = await Promise.all([
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
    // Besitzt der Nutzer bereits eine Community? (Creator-CTA in der App
    // ausblenden.) Ohne Token immer false.
    user ? prisma.tenant.count({ where: { ownerId: user.id } }) : Promise.resolve(0),
  ]);

  const myTenants = myMemberships.map((m) => m.tenant as TenantWithCount);
  const myIds = new Set(myTenants.map((t) => t.id));

  // „Themen entdecken" + „Top-Kreative" je genutzter Kategorie (wie app/home).
  const used = await categoriesInUse();
  const usedCats = CATEGORIES.filter((c) => used.has(c.key));
  const catRows = await Promise.all(
    usedCats.map((c) =>
      prisma.tenant.findMany({
        where: { category: c.key },
        include: { _count: { select: { memberships: true } } },
        orderBy: { memberships: { _count: "desc" } },
        take: 12,
      }),
    ),
  );

  const allIds = [
    ...new Set([
      ...popularRows.map((t) => t.id),
      ...newestRows.map((t) => t.id),
      ...myTenants.map((t) => t.id),
      ...catRows.flat().map((t) => t.id),
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
    ownsCommunity: ownedCount > 0,
    myCommunities: myTenants.map(card),
    popular: popularRows.map((t) => card(t as TenantWithCount)),
    newest: newestRows.map((t) => card(t as TenantWithCount)),
    topics: usedCats.map((c) => ({
      key: c.key,
      label: c.label,
      count: used.get(c.key) ?? 0,
    })),
    topCreators: usedCats.map((c, i) => ({
      key: c.key,
      label: c.label,
      communities: catRows[i].map((t) => card(t as TenantWithCount)),
    })),
  });
}
