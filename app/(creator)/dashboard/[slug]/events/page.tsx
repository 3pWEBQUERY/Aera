import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import {
  EventsManager,
  type EventRowData,
} from "@/components/dashboard/events-manager";

export default async function EventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  const rows = await prisma.event.findMany({
    where: { tenantId: tenant.id },
    orderBy: { startsAt: "asc" },
    include: { _count: { select: { rsvps: true } } },
  });

  const events: EventRowData[] = rows.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    startsAt: e.startsAt,
    location: e.location,
    isOnline: e.isOnline,
    meetingUrl: e.meetingUrl,
    coverUrl: e.coverUrl,
    capacity: e.capacity,
    rsvpCount: e._count.rsvps,
  }));

  return <EventsManager slug={slug} events={events} />;
}
