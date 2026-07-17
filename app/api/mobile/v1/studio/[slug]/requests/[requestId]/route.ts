import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/mobile/api";
import {
  requireStudioAccess,
  studioRequestDtos,
  STUDIO_REQUEST_INCLUDE,
} from "@/lib/mobile/studio";

// POST /api/mobile/v1/studio/{slug}/requests/{requestId} { action } → StudioRequest
// Statuswechsel gespiegelt aus updateRequestAction (app/actions/requests.ts):
// accept→ACCEPTED, decline→DECLINED, fulfill→FULFILLED. Bepreisen (PRICED)
// bleibt bewusst dem Web-Dashboard vorbehalten (Stripe-Checkout-Flow).

const schema = z.object({
  action: z.enum(["accept", "decline", "fulfill"]),
});

const STATUS_BY_ACTION = {
  accept: "ACCEPTED",
  decline: "DECLINED",
  fulfill: "FULFILLED",
} as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; requestId: string }> },
) {
  const { slug, requestId } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant, user } = access;

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;

  const request = await prisma.memberRequest.findFirst({
    where: { id: requestId, tenantId: tenant.id },
  });
  if (!request) return jsonError("not_found", "Request not found.", 404);

  const updated = await prisma.memberRequest.update({
    where: { id: request.id },
    data: { status: STATUS_BY_ACTION[parsed.data.action] },
    include: STUDIO_REQUEST_INCLUDE,
  });

  const [dto] = await studioRequestDtos(tenant.id, [updated], user.id);
  return jsonOk(dto);
}
