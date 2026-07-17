import prisma from "@/lib/prisma";
import { cursorPagination, jsonError, jsonOk } from "@/lib/mobile/api";
import {
  requireStudioAccess,
  sanitizeShippingDetails,
  type StudioOrderDto,
} from "@/lib/mobile/studio";
import type { OrderStatus } from "@/app/generated/prisma/client";

// GET /api/mobile/v1/studio/{slug}/orders?status=&cursor=
// → { data: StudioOrder[], nextCursor }
// Verkäufe des Tenants inkl. Käufer + Versanddaten (nur Name/Adresse —
// sanitizeShippingDetails filtert das rohe Stripe-JSON).

const STATUSES: OrderStatus[] = ["PENDING", "PAID", "REFUNDED", "FAILED"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant } = access;

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status") ?? "";
  if (statusRaw && !STATUSES.includes(statusRaw as OrderStatus)) {
    return jsonError("validation", "status: must be PENDING, PAID, REFUNDED or FAILED.", 400);
  }
  const { limit, cursor } = cursorPagination(req);

  const rows = await prisma.order.findMany({
    where: {
      tenantId: tenant.id,
      ...(statusRaw ? { status: statusRaw as OrderStatus } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { name: true, email: true } },
      product: { select: { name: true, requiresShipping: true } },
    },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const data: StudioOrderDto[] = page.map((o) => ({
    id: o.id,
    description: o.description,
    productName: o.product?.name ?? null,
    customer: { name: o.user.name, email: o.user.email },
    amountCents: o.amountCents,
    currency: o.currency,
    status: o.status,
    fulfilled: o.fulfilled,
    requiresShipping: o.product?.requiresShipping ?? false,
    shippingDetails: sanitizeShippingDetails(o.shippingDetails),
    createdAt: o.createdAt.toISOString(),
  }));

  return jsonOk({ data, nextCursor: hasMore ? page[page.length - 1]!.id : null });
}
