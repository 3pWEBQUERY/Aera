import prisma from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/mobile/api";
import {
  requireStudioAccess,
  studioRequestDtos,
  STUDIO_REQUEST_INCLUDE,
} from "@/lib/mobile/studio";
import type { RequestStatus } from "@/app/generated/prisma/client";

// GET /api/mobile/v1/studio/{slug}/requests?status= → { data: StudioRequest[] }
// Staff-Sicht auf das Wünsche-Board: alle Requests (inkl. DECLINED),
// Sortierung wie das Web (score desc, createdAt desc), Shape wie das
// Community-Request-Objekt plus author.email.

const STATUSES: RequestStatus[] = ["OPEN", "ACCEPTED", "PRICED", "FULFILLED", "DECLINED"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant, user } = access;

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status") ?? "";
  if (statusRaw && !STATUSES.includes(statusRaw as RequestStatus)) {
    return jsonError(
      "validation",
      "status: must be OPEN, ACCEPTED, PRICED, FULFILLED or DECLINED.",
      400,
    );
  }

  const rows = await prisma.memberRequest.findMany({
    where: {
      tenantId: tenant.id,
      ...(statusRaw ? { status: statusRaw as RequestStatus } : {}),
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: STUDIO_REQUEST_INCLUDE,
  });

  const data = await studioRequestDtos(tenant.id, rows, user.id);
  return jsonOk({ data });
}
