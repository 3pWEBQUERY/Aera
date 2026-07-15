import prisma from "@/lib/prisma";
import { jsonOk, requireMobileAuth } from "@/lib/mobile/api";
import { toOrderDto } from "@/lib/mobile/serializers";

// GET /api/mobile/v1/me/orders → { data: Order[] } — über alle Tenants,
// jede Bestellung mit communityName.

export async function GET(req: Request) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const orders = await prisma.order.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      product: { select: { name: true, downloadUrl: true } },
      tenant: { select: { name: true } },
    },
  });

  return jsonOk({
    data: orders.map((o) => ({
      ...toOrderDto(o),
      communityName: o.tenant.name,
    })),
  });
}
