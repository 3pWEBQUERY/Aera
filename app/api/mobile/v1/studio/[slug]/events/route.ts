import { z } from "zod";
import prisma from "@/lib/prisma";
import { indexContent } from "@/lib/ai";
import { uniqueChildSlug } from "@/lib/slug";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";
import type { EventDto } from "@/lib/mobile/serializers";

// POST /api/mobile/v1/studio/{slug}/events { spaceSlug?, title, ... } → Event
// Logik gespiegelt aus createEventAction (app/actions/dashboard.ts):
// Space-Ermittlung = expliziter EVENTS-Space per Slug, sonst erster
// EVENTS-Space, sonst wird ein "Events"-Space (MEMBERS) angelegt.

const schema = z.object({
  spaceSlug: z.string().optional(),
  title: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
  location: z.string().max(160).optional(),
  isOnline: z.boolean().optional(),
  meetingUrl: z.string().url().optional().or(z.literal("")),
  capacity: z.number().int().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant } = access;

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;
  const input = parsed.data;

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return jsonError("validation", "startsAt: Invalid ISO date.", 400);
  }
  const endsAt = input.endsAt?.trim() ? new Date(input.endsAt) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return jsonError("validation", "endsAt: Invalid ISO date.", 400);
  }

  // Space-Ermittlung wie im Web-Dashboard.
  let space = input.spaceSlug
    ? await prisma.space.findFirst({
        where: { tenantId: tenant.id, slug: input.spaceSlug, type: "EVENTS" },
      })
    : await prisma.space.findFirst({ where: { tenantId: tenant.id, type: "EVENTS" } });
  if (!space && input.spaceSlug) {
    return jsonError("not_found", "Events space not found.", 404);
  }
  if (!space) {
    space = await prisma.space.create({
      data: {
        tenantId: tenant.id,
        name: "Events",
        slug: await uniqueChildSlug("space", tenant.id, "Events"),
        type: "EVENTS",
        visibility: "MEMBERS",
      },
    });
  }

  const capacity = input.capacity && input.capacity > 0 ? input.capacity : null;
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      title: input.title.trim(),
      slug: await uniqueChildSlug("event", tenant.id, input.title),
      description: input.description?.trim() || null,
      startsAt,
      endsAt,
      location: input.location?.trim() || null,
      isOnline: Boolean(input.isOnline),
      meetingUrl: input.meetingUrl?.trim() || null,
      capacity,
    },
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "EVENT",
    sourceId: event.id,
    title: event.title,
    content: event.description || event.title,
  });

  // Event-Shape wie die Community-API (frisch angelegt: 0 RSVPs, Staff-Sicht).
  const dto: EventDto = {
    id: event.id,
    title: event.title,
    slug: event.slug,
    description: event.description,
    coverUrl: event.coverUrl,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt ? event.endsAt.toISOString() : null,
    location: event.location,
    isOnline: event.isOnline,
    meetingUrl: event.meetingUrl,
    capacity: event.capacity,
    rsvpCount: 0,
    myRsvp: false,
    accessible: true,
  };
  return jsonOk(dto);
}
