import prisma from "@/lib/prisma";
import { withApiAuth, listResponse } from "@/lib/public-api";

/**
 * GET /api/v1/members — Mitglieder der Community (neueste zuerst).
 * Auth: `Authorization: Bearer aera_sk_…` · Pagination: ?limit=&cursor=
 */
export async function GET(req: Request) {
  return withApiAuth(req, async ({ tenant, limit, cursor }) => {
    const rows = await prisma.membership.findMany({
      where: { tenantId: tenant.id },
      orderBy: { joinedAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { name: true, email: true, emailVerifiedAt: true } },
        tier: { select: { name: true, slug: true } },
      },
    });
    return listResponse(
      rows.map((m) => ({
        id: m.id,
        name: m.user.name,
        email: m.user.email,
        emailVerified: Boolean(m.user.emailVerifiedAt),
        role: m.role,
        status: m.status,
        tier: m.tier ? { name: m.tier.name, slug: m.tier.slug } : null,
        joinedAt: m.joinedAt.toISOString(),
      })),
      limit,
    );
  });
}
