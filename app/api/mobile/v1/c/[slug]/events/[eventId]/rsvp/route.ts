import prisma from "@/lib/prisma";
import { awardPoints } from "@/lib/gamification";
import { buildAccessContext, canParticipate } from "@/lib/entitlements";
import { canRsvpEvent, eventIsFull } from "@/lib/participation";
import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";

// POST /api/mobile/v1/c/{slug}/events/{eventId}/rsvp → { going, rsvpCount }
// Toggle-Logik gespiegelt aus rsvpEventAction (app/actions/engage.ts).

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; eventId: string }> },
) {
  const { slug, eventId } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const event = await prisma.event.findFirst({
    where: { id: eventId, tenantId: tenant.id },
    include: { space: true },
  });
  if (!event) return jsonError("not_found", "Event not found.", 404);

  const existing = await prisma.eventRsvp.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
  });
  let going: boolean;
  if (existing) {
    // Absagen geht immer — auch nach Sperre oder Kündigung.
    await prisma.eventRsvp.delete({ where: { id: existing.id } });
    going = false;
  } else {
    const ctx = await buildAccessContext(tenant.id, user.id);
    if (!canParticipate(ctx)) {
      return jsonError("not_member", "Active membership required.", 403);
    }
    // Space-Zugriff und Event-Sperre — dieselbe Regel wie im Web.
    if (!canRsvpEvent(event, ctx)) {
      return jsonError("payment_required", "You do not have access to this event.", 403);
    }
    if (await eventIsFull(event)) {
      return jsonError("event_full", "This event is fully booked.", 409);
    }
    await prisma.eventRsvp.create({
      data: { tenantId: tenant.id, eventId, userId: user.id, status: "GOING" },
    });
    going = true;
    await awardPoints({
      tenantId: tenant.id,
      userId: user.id,
      trigger: "EVENT_RSVP",
      refType: "Event",
      refId: eventId,
    });
  }

  const rsvpCount = await prisma.eventRsvp.count({
    where: { tenantId: tenant.id, eventId },
  });
  return jsonOk({ going, rsvpCount });
}
