import prisma from "@/lib/prisma";
import { categoryByKey, isValidCategory } from "@/lib/categories";
import { jsonOk, mobileAuth } from "@/lib/mobile/api";
import {
  communityCoverMap,
  toCommunityCard,
  type CommunityCardDto,
} from "@/lib/mobile/serializers";
import type { Tenant } from "@/app/generated/prisma/client";

// GET /api/mobile/v1/explore (Token optional — personalisiert wenn vorhanden)
//   → { trending: [{ key, label }], forYou: CommunityCard[], popularWeek: CommunityCard[] }
// trending:    Kategorien sortiert nach Community-Anzahl (max 8).
// forYou:      eingeloggt → Communities aus den Kategorien der eigenen
//              Mitgliedschaften (ohne eigene), nach memberCount (max 12);
//              ausgeloggt / keine Kategorien → beliebteste.
// popularWeek: meiste neue Mitglieder der letzten 7 Tage (Membership.joinedAt),
//              aufgefüllt per memberCount-Fallback (max 12).

type TenantWithCount = Tenant & { _count: { memberships: number } };

const COUNT_INCLUDE = { _count: { select: { memberships: true } } } as const;
const POPULAR_ORDER = { memberships: { _count: "desc" as const } };

/** Genutzte Kategorien (key → Community-Anzahl); wie /discover tolerant vor Migration. */
async function categoriesInUse(): Promise<Map<string, number>> {
  try {
    const rows = await prisma.tenant.groupBy({
      by: ["category"],
      _count: { _all: true },
      where: { category: { not: null }, status: "ACTIVE" },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.category && isValidCategory(r.category)) map.set(r.category, r._count._all);
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function GET(req: Request) {
  const user = await mobileAuth(req);
  const since = new Date(Date.now() - 7 * 24 * 3_600_000);

  const [used, myMemberships, popularRows, weekJoins] = await Promise.all([
    categoriesInUse(),
    user
      ? prisma.membership.findMany({
          where: {
            userId: user.id,
            status: "ACTIVE",
            tenant: { status: "ACTIVE" },
          },
          select: { tenantId: true, tenant: { select: { category: true } } },
        })
      : Promise.resolve([]),
    // Beliebteste Communities (Puffer 24: dient als forYou-Fallback und zum
    // Auffüllen von popularWeek).
    prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      include: COUNT_INCLUDE,
      orderBy: POPULAR_ORDER,
      take: 24,
    }),
    prisma.membership.groupBy({
      by: ["tenantId"],
      where: { joinedAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { tenantId: "desc" } },
      take: 12,
    }),
  ]);

  const myIds = new Set(myMemberships.map((m) => m.tenantId));

  // trending: Kategorien nach Community-Anzahl, max 8.
  const trending = [...used.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key]) => ({ key, label: categoryByKey(key)?.label ?? key }));

  // forYou: Kategorien der eigenen Mitgliedschaften, ohne eigene Communities.
  const myCategories = [
    ...new Set(
      myMemberships
        .map((m) => m.tenant.category)
        .filter((c): c is string => Boolean(c && isValidCategory(c))),
    ),
  ];
  let forYouRows: TenantWithCount[] = [];
  if (myCategories.length > 0) {
    forYouRows = (await prisma.tenant.findMany({
      where: {
        category: { in: myCategories },
        id: { notIn: [...myIds] },
        status: "ACTIVE",
      },
      include: COUNT_INCLUDE,
      orderBy: POPULAR_ORDER,
      take: 12,
    })) as TenantWithCount[];
  }
  if (forYouRows.length === 0) {
    // Ausgeloggt oder keine passenden Kategorien → beliebteste Communities.
    forYouRows = (popularRows as TenantWithCount[]).slice(0, 12);
  }

  // popularWeek: nach neuen Mitgliedern der letzten 7 Tage, Rest per memberCount.
  const weekIds = weekJoins.map((g) => g.tenantId);
  const weekTenants = weekIds.length
    ? ((await prisma.tenant.findMany({
        where: { id: { in: weekIds }, status: "ACTIVE" },
        include: COUNT_INCLUDE,
      })) as TenantWithCount[])
    : [];
  const weekOrder = new Map(weekIds.map((id, i) => [id, i]));
  weekTenants.sort(
    (a, b) => (weekOrder.get(a.id) ?? 99) - (weekOrder.get(b.id) ?? 99),
  );
  const popularWeekRows: TenantWithCount[] = [...weekTenants];
  for (const t of popularRows as TenantWithCount[]) {
    if (popularWeekRows.length >= 12) break;
    if (!weekOrder.has(t.id)) popularWeekRows.push(t);
  }

  const allIds = [
    ...new Set([...forYouRows, ...popularWeekRows].map((t) => t.id)),
  ];
  const covers = await communityCoverMap(allIds);

  const card = (t: TenantWithCount): CommunityCardDto =>
    toCommunityCard(t, {
      coverUrl: covers.get(t.id) ?? null,
      memberCount: t._count.memberships,
      isMember: myIds.has(t.id),
    });

  return jsonOk({
    trending,
    forYou: forYouRows.map(card),
    popularWeek: popularWeekRows.slice(0, 12).map(card),
  });
}
