import prisma from "@/lib/prisma";
import { leaderboard } from "@/lib/gamification";
import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import type { MemberCardDto } from "@/lib/mobile/serializers";

// GET /api/mobile/v1/c/{slug}/leaderboard
// → { top: [{ rank, member: MemberCard }], me: { rank, points, levelName }|null }

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership?.status !== "ACTIVE") {
    return jsonError("not_member", "Active membership required.", 403);
  }

  const top = await leaderboard(tenant.id, 20);
  const memberships = await prisma.membership.findMany({
    where: { tenantId: tenant.id, userId: { in: top.map((t) => t.userId) } },
    include: { tier: { select: { name: true } } },
  });
  const mMap = new Map(memberships.map((m) => [m.userId, m]));

  const myStats = await prisma.memberStats.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    select: { points: true, levelName: true },
  });
  const myPoints = myStats?.points ?? 0;
  const myRank =
    myPoints > 0
      ? (await prisma.memberStats.count({
          where: { tenantId: tenant.id, points: { gt: myPoints } },
        })) + 1
      : null;

  return jsonOk({
    top: top.map((row, i) => {
      const m = mMap.get(row.userId);
      const member: MemberCardDto = {
        userId: row.userId,
        name: row.name,
        avatarUrl: row.avatarUrl,
        role: m?.role ?? "MEMBER",
        tierName: m?.tier?.name ?? null,
        points: row.points,
        levelName: row.levelName,
        joinedAt: (m?.joinedAt ?? new Date(0)).toISOString(),
      };
      return { rank: i + 1, member };
    }),
    me: { rank: myRank, points: myPoints, levelName: myStats?.levelName ?? null },
  });
}
