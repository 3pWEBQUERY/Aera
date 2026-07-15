import prisma from "@/lib/prisma";
import { markAllNotificationsRead } from "@/lib/notifications";
import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import { roleMapFor, toAuthor, type NotificationDto } from "@/lib/mobile/serializers";

// GET /api/mobile/v1/c/{slug}/notifications → { data: Notification[] }
// Markiert die Benachrichtigungen NACH der Serialisierung als gelesen
// (readAt in der Antwort zeigt also den Zustand vor diesem Abruf).

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const rows = await prisma.notification.findMany({
    where: { tenantId: tenant.id, userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
  });
  const roles = await roleMapFor(
    tenant.id,
    rows.flatMap((r) => (r.actor ? [r.actor.id] : [])),
  );

  const data: NotificationDto[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    href: r.href || null,
    actor: r.actor ? toAuthor(r.actor, roles) : null,
    createdAt: r.createdAt.toISOString(),
    readAt: r.readAt ? r.readAt.toISOString() : null,
  }));

  await markAllNotificationsRead(tenant.id, user.id);
  return jsonOk({ data });
}
