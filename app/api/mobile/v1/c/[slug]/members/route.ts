import prisma from "@/lib/prisma";
import { env } from "@/lib/env";
import { ensureReferralCode } from "@/lib/referrals";
import {
  cursorPagination,
  jsonError,
  jsonOk,
  requireMobileAuth,
  resolveTenant,
} from "@/lib/mobile/api";
import type { MemberCardDto } from "@/lib/mobile/serializers";

// GET /api/mobile/v1/c/{slug}/members?cursor=
// → { data: MemberCard[], nextCursor, inviteUrl }

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

  const { limit, cursor } = cursorPagination(req);
  const rows = await prisma.membership.findMany({
    where: { tenantId: tenant.id, status: "ACTIVE" },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      tier: { select: { name: true } },
    },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const stats = await prisma.memberStats.findMany({
    where: { tenantId: tenant.id, userId: { in: page.map((m) => m.userId) } },
    select: { userId: true, points: true, levelName: true },
  });
  const statMap = new Map(stats.map((s) => [s.userId, s]));

  // Referral-Link des anfragenden Mitglieds (lazily erzeugter Code).
  const code = await ensureReferralCode(tenant.id, user.id);
  const inviteUrl = code
    ? `${env.APP_URL}/c/${tenant.slug}/join?ref=${encodeURIComponent(code)}`
    : null;

  // Cursor ist die Membership-ID (nextCursor unten); die Karten selbst
  // enthalten exakt die MemberCard-Felder aus dem Vertrag.
  const data: MemberCardDto[] = page.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    tierName: m.tier?.name ?? null,
    points: statMap.get(m.userId)?.points ?? 0,
    levelName: statMap.get(m.userId)?.levelName ?? null,
    joinedAt: m.joinedAt.toISOString(),
  }));

  return jsonOk({
    data,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
    inviteUrl,
  });
}
