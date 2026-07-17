import prisma from "@/lib/prisma";
import { jsonOk } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";
import { excerpt } from "@/lib/utils";

// GET /api/mobile/v1/studio/{slug}/overview → { stats, recentActivity }
// Kennzahlen gespiegelt aus der Dashboard-Übersicht
// (app/(creator)/dashboard/[slug]/page.tsx): Umsatz = Order(PAID, nicht
// REFUNDED), Abonnenten = aktive Subscriptions.

interface ActivityItem {
  kind: "member_joined" | "comment" | "order" | "request";
  title: string;
  subtitle: string | null;
  createdAt: string;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const t = access.tenant.id;
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    members,
    activeMembers,
    pendingMembers,
    posts30d,
    comments30d,
    revenue30dAgg,
    revenueTotalAgg,
    subscribers,
    latestOrder,
    recentMembers,
    recentComments,
    recentOrders,
    recentRequests,
  ] = await Promise.all([
    prisma.membership.count({ where: { tenantId: t } }),
    prisma.membership.count({ where: { tenantId: t, status: "ACTIVE" } }),
    prisma.membership.count({ where: { tenantId: t, status: "PENDING" } }),
    prisma.post.count({ where: { tenantId: t, createdAt: { gte: since30d } } }),
    prisma.comment.count({ where: { tenantId: t, createdAt: { gte: since30d } } }),
    prisma.order.aggregate({
      where: { tenantId: t, status: "PAID", refundedAt: null, createdAt: { gte: since30d } },
      _sum: { amountCents: true },
    }),
    prisma.order.aggregate({
      where: { tenantId: t, status: "PAID", refundedAt: null },
      _sum: { amountCents: true },
    }),
    prisma.subscription.count({ where: { tenantId: t, status: "ACTIVE" } }),
    prisma.order.findFirst({
      where: { tenantId: t, status: "PAID" },
      orderBy: { createdAt: "desc" },
      select: { currency: true },
    }),
    prisma.membership.findMany({
      where: { tenantId: t },
      orderBy: { joinedAt: "desc" },
      take: 10,
      include: {
        user: { select: { name: true } },
        tier: { select: { name: true } },
      },
    }),
    prisma.comment.findMany({
      where: { tenantId: t },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { author: { select: { name: true } } },
    }),
    prisma.order.findMany({
      where: { tenantId: t, status: "PAID" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.memberRequest.findMany({
      where: { tenantId: t },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { requester: { select: { name: true } } },
    }),
  ]);

  const activity: ActivityItem[] = [
    ...recentMembers.map((m) => ({
      kind: "member_joined" as const,
      title: m.user.name,
      subtitle: m.tier?.name ?? null,
      createdAt: m.joinedAt.toISOString(),
    })),
    ...recentComments.map((c) => ({
      kind: "comment" as const,
      title: c.author.name,
      subtitle: excerpt(c.body, 120) || null,
      createdAt: c.createdAt.toISOString(),
    })),
    ...recentOrders.map((o) => ({
      kind: "order" as const,
      title: o.description,
      subtitle: o.user.name,
      createdAt: o.createdAt.toISOString(),
    })),
    ...recentRequests.map((r) => ({
      kind: "request" as const,
      title: r.title,
      subtitle: r.requester.name,
      createdAt: r.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 15);

  return jsonOk({
    stats: {
      members,
      activeMembers,
      pendingMembers,
      posts30d,
      comments30d,
      revenueCents30d: revenue30dAgg._sum.amountCents ?? 0,
      revenueCentsTotal: revenueTotalAgg._sum.amountCents ?? 0,
      currency: latestOrder?.currency ?? "eur",
      subscribers,
    },
    recentActivity: activity,
  });
}
