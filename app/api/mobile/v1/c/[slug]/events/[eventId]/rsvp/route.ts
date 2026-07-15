import prisma from "@/lib/prisma";
import { awardPoints } from "@/lib/gamification";
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
  });
  if (!event) return jsonError("not_found", "Event not found.", 404);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership?.status !== "ACTIVE") {
    return jsonError("not_member", "Active membership required.", 403);
  }

  const existing = await prisma.eventRsvp.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
  });
  let going: boolean;
  if (existing) {
    await prisma.eventRsvp.delete({ where: { id: existing.id } });
    going = false;
  } else {
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
