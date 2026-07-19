import prisma from "@/lib/prisma";
import { jsonOk, mobileAuth } from "@/lib/mobile/api";
import { communityCoverMap, toCommunityCard } from "@/lib/mobile/serializers";

// GET /api/mobile/v1/discover/search?q=&category= → { data: CommunityCard[] }

export async function GET(req: Request) {
  const user = await mobileAuth(req);
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const category = (url.searchParams.get("category") ?? "").trim().slice(0, 40);

  const rows = await prisma.tenant.findMany({
    where: {
      status: "ACTIVE",
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { tagline: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { memberships: true } } },
    orderBy: { memberships: { _count: "desc" } },
    take: 30,
  });

  const myIds = user
    ? new Set(
        (
          await prisma.membership.findMany({
            where: { userId: user.id, status: "ACTIVE", tenantId: { in: rows.map((t) => t.id) } },
            select: { tenantId: true },
          })
        ).map((m) => m.tenantId),
      )
    : new Set<string>();
  const covers = await communityCoverMap(rows.map((t) => t.id));

  return jsonOk({
    data: rows.map((t) =>
      toCommunityCard(t, {
        coverUrl: covers.get(t.id) ?? null,
        memberCount: t._count.memberships,
        isMember: myIds.has(t.id),
      }),
    ),
  });
}
