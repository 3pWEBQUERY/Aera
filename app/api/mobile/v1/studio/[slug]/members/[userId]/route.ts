import { z } from "zod";
import prisma from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/mobile/api";
import {
  requireStudioAccess,
  studioMemberDtos,
  STUDIO_MEMBER_INCLUDE,
} from "@/lib/mobile/studio";
import { canManageTenantMembership } from "@/lib/capabilities";

// POST /api/mobile/v1/studio/{slug}/members/{userId} { action } → { member }
// Effekte gespiegelt aus updateMemberAction (app/actions/dashboard.ts):
// approve: PENDING→ACTIVE, ban: →BANNED, unban: BANNED→ACTIVE.
// Guards wie im Web: OWNER ist geschützt, die eigene Membership ist tabu.
// Rollenwechsel bleibt bewusst dem Web-Dashboard vorbehalten. minRole ADMIN —
// das Web erlaubt Mitglieder-Verwaltung ebenfalls erst ab ADMIN.

const schema = z.object({
  action: z.enum(["approve", "ban", "unban"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; userId: string }> },
) {
  const { slug, userId } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant, user, role: actorRole } = access;

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;
  const { action } = parsed.data;

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
  });
  if (!membership) return jsonError("not_found", "Member not found.", 404);
  if (!canManageTenantMembership(actorRole, membership.role)) {
    return jsonError(
      "not_authorized",
      membership.role === "OWNER"
        ? "The owner cannot be modified."
        : "Only the owner can modify administrators.",
      403,
    );
  }
  if (membership.userId === user.id) {
    return jsonError("not_authorized", "You cannot change your own membership.", 403);
  }

  if (action === "approve" && membership.status !== "PENDING") {
    return jsonError("validation", "Member is not pending.", 400);
  }
  if (action === "unban" && membership.status !== "BANNED") {
    return jsonError("validation", "Member is not banned.", 400);
  }
  const status = action === "ban" ? ("BANNED" as const) : ("ACTIVE" as const);

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: { status },
    include: STUDIO_MEMBER_INCLUDE,
  });
  // Audit wie updateMemberAction (action "member.update", Rolle unverändert).
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "member.update",
    targetType: "Membership",
    targetId: membership.id,
    metadata: { role: membership.role, status },
  });

  const [member] = await studioMemberDtos(tenant.id, [updated]);
  return jsonOk({ member });
}
