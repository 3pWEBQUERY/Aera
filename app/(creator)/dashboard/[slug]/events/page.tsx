import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import {
  EventsManager,
  type EventRowData,
} from "@/components/dashboard/events-manager";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Titel "{Seite} – {Community}" (Template im Dashboard-Layout).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.events");
  return { title: t("title") };
}

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
