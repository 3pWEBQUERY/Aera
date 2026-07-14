import prisma from "@/lib/prisma";
import { withApiAuth, listResponse } from "@/lib/public-api";

/**
 * GET /api/v1/subscriptions — Abonnements (neueste zuerst).
 * Auth: `Authorization: Bearer aera_sk_…` · Pagination: ?limit=&cursor=
 */
export async function GET(req: Request) {
  return withApiAuth(req, async ({ tenant, limit, cursor }) => {
    const rows = await prisma.subscription.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { name: true, email: true } },
        tier: { select: { name: true, slug: true, priceCents: true, interval: true } },
      },
    });
    return listResponse(
      rows.map((s) => ({
        id: s.id,
        customer: { name: s.user.name, email: s.user.email },
        tier: {
          name: s.tier.name,
          slug: s.tier.slug,
          priceCents: s.tier.priceCents,
          interval: s.tier.interval,
        },
        status: s.status,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
      limit,
    );
  });
}
