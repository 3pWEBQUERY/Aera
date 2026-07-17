import prisma from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";

// POST /api/mobile/v1/studio/{slug}/orders/{orderId}/fulfill → { fulfilled: true }
// Markiert eine Bestellung als versendet/erfüllt (Order.fulfilled), Effekt wie
// das Fulfilled-Flag in adminUpdateOrderAction (app/actions/admin.ts) —
// Status bleibt unverändert. Idempotent.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; orderId: string }> },
) {
  const { slug, orderId } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant, user } = access;

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: tenant.id },
  });
  if (!order) return jsonError("not_found", "Order not found.", 404);

  if (!order.fulfilled) {
    await prisma.order.update({
      where: { id: order.id },
      data: { fulfilled: true },
    });
    await writeAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "order.fulfill",
      targetType: "Order",
      targetId: order.id,
    });
  }
  return jsonOk({ fulfilled: true });
}
