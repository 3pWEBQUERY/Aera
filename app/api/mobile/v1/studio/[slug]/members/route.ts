import prisma from "@/lib/prisma";
import { cursorPagination, jsonError, jsonOk } from "@/lib/mobile/api";
import {
  requireStudioAccess,
  studioMemberDtos,
  STUDIO_MEMBER_INCLUDE,
} from "@/lib/mobile/studio";

// GET /api/mobile/v1/studio/{slug}/members?status=&q=&cursor=
// → { data: StudioMember[], nextCursor }
// Verwaltungssicht (inkl. PENDING/BANNED + E-Mail) — Datenbasis wie die
// Web-Mitgliederliste (app/(creator)/dashboard/[slug]/members/page.tsx).

const STATUSES = ["ACTIVE", "PENDING", "BANNED"] as const;
type Status = (typeof STATUSES)[number];

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
  if (statusRaw && !STATUSES.includes(statusRaw as Status)) {
    return jsonError("validation", "status: must be ACTIVE, PENDING or BANNED.", 400);
  }
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const { limit, cursor } = cursorPagination(req);

  const rows = await prisma.membership.findMany({
    where: {
      tenantId: tenant.id,
      ...(statusRaw ? { status: statusRaw as Status } : {}),
      ...(q
        ? {
            user: {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: STUDIO_MEMBER_INCLUDE,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const data = await studioMemberDtos(tenant.id, page);
  // Cursor ist die Membership-ID (stabil, auch bei Namens-Suche).
  return jsonOk({ data, nextCursor: hasMore ? page[page.length - 1]!.id : null });
}
