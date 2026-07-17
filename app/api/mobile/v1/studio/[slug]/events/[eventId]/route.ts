import prisma from "@/lib/prisma";
import { removeFromIndex } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";

// DELETE /api/mobile/v1/studio/{slug}/events/{eventId} → { ok }
// Effekte gespiegelt aus deleteEventAction (app/actions/dashboard.ts):
// Suchindex-Eintrag entfernen, Event löschen, Audit "event.delete".

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string; eventId: string }> },
) {
  const { slug, eventId } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant, user } = access;

  const event = await prisma.event.findFirst({
    where: { id: eventId, tenantId: tenant.id },
  });
  if (!event) return jsonError("not_found", "Event not found.", 404);

  await removeFromIndex(tenant.id, "EVENT", event.id);
  await prisma.event.delete({ where: { id: event.id } });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "event.delete",
    targetType: "Event",
    targetId: event.id,
  });
  return jsonOk({ ok: true });
}
