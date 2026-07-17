import prisma from "@/lib/prisma";
import { jsonOk, requireMobileAuth } from "@/lib/mobile/api";
import {
  communityCoverMap,
  toCommunityCard,
  type CommunityCardDto,
} from "@/lib/mobile/serializers";
import type { Role } from "@/app/generated/prisma/client";

// GET /api/mobile/v1/studio
// → { communities: [{ community: CommunityCard, role, memberCount,
//      pendingMembers, revenueCents30d }] }
// Alle Tenants, in denen der User OWNER/ADMIN/MODERATOR ist (Rollenmenge wie
// lib/tenant.ts userTenants, plus MODERATOR für Moderations-Endpoints).
// Cross-tenant-Query wie die Discover-Routen bewusst ohne RLS-Tenant-Kontext.

export async function GET(req: Request) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, role: { in: ["OWNER", "ADMIN", "MODERATOR"] } },
    include: { tenant: true },
    orderBy: { joinedAt: "asc" },
  });
  const tenantIds = memberships.map((m) => m.tenantId);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [covers, memberGroups, revenueGroups] = await Promise.all([
    communityCoverMap(tenantIds),
    tenantIds.length
      ? prisma.membership.groupBy({
          by: ["tenantId", "status"],
          where: { tenantId: { in: tenantIds }, status: { in: ["ACTIVE", "PENDING"] } },
          _count: true,
        })
      : Promise.resolve([]),
    // Umsatz: bezahlte Orders, nicht erstattet (Status REFUNDED ist eigener
    // Status; refundedAt zusätzlich als Guard).
    tenantIds.length
      ? prisma.order.groupBy({
          by: ["tenantId"],
          where: {
            tenantId: { in: tenantIds },
            status: "PAID",
            refundedAt: null,
            createdAt: { gte: since30d },
          },
          _sum: { amountCents: true },
        })
      : Promise.resolve([]),
  ]);

  const activeCounts = new Map<string, number>();
  const pendingCounts = new Map<string, number>();
  for (const g of memberGroups) {
    const map = g.status === "ACTIVE" ? activeCounts : pendingCounts;
    map.set(g.tenantId, g._count as number);
  }
  const revenueMap = new Map<string, number>();
  for (const g of revenueGroups) revenueMap.set(g.tenantId, g._sum.amountCents ?? 0);

  const communities: Array<{
    community: CommunityCardDto;
    role: Role;
    memberCount: number;
    pendingMembers: number;
    revenueCents30d: number;
  }> = memberships.map((m) => {
    const memberCount = activeCounts.get(m.tenantId) ?? 0;
    return {
      community: toCommunityCard(m.tenant, {
        coverUrl: covers.get(m.tenantId) ?? null,
        memberCount,
        isMember: m.status === "ACTIVE",
      }),
      role: m.role,
      memberCount,
      pendingMembers: pendingCounts.get(m.tenantId) ?? 0,
      revenueCents30d: revenueMap.get(m.tenantId) ?? 0,
    };
  });

  return jsonOk({ communities });
}
