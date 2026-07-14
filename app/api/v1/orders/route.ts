import prisma from "@/lib/prisma";
import { withApiAuth, listResponse } from "@/lib/public-api";

/**
 * GET /api/v1/orders — Bestellungen (neueste zuerst).
 * Auth: `Authorization: Bearer aera_sk_…` · Pagination: ?limit=&cursor=
 * Filter: ?status=PAID|PENDING|REFUNDED|FAILED
 */
export async function GET(req: Request) {
  return withApiAuth(req, async ({ tenant, limit, cursor }) => {
    const status = new URL(req.url).searchParams.get("status");
    const validStatus = ["PAID", "PENDING", "REFUNDED", "FAILED"].includes(
      status ?? "",
    )
      ? (status as "PAID" | "PENDING" | "REFUNDED" | "FAILED")
      : undefined;

    const rows = await prisma.order.findMany({
      where: { tenantId: tenant.id, ...(validStatus ? { status: validStatus } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { name: true, email: true } },
        product: { select: { name: true } },
      },
    });
    return listResponse(
      rows.map((o) => ({
        id: o.id,
        description: o.description,
        product: o.product?.name ?? null,
        customer: { name: o.user.name, email: o.user.email },
        amountCents: o.amountCents,
        currency: o.currency,
        platformFeeCents: o.platformFeeCents,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
      limit,
    );
  });
}
