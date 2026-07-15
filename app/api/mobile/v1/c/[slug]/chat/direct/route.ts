import { z } from "zod";
import prisma from "@/lib/prisma";
import { findOrCreateDirect } from "@/lib/chat";
import { jsonError, jsonOk, parseJsonBody, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import { roleMapFor, toAuthor, type ConversationDto } from "@/lib/mobile/serializers";

// POST /api/mobile/v1/c/{slug}/chat/direct  { userId } → { conversation }
// Findet (oder erstellt) den DM-Thread zwischen zwei aktiven Mitgliedern.

const schema = z.object({ userId: z.string().min(1) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const me = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;
  const otherId = parsed.data.userId;
  if (otherId === me.id) {
    return jsonError("validation", "Cannot start a conversation with yourself.", 400);
  }

  // Beide Seiten müssen aktive Mitglieder der Community sein.
  const [myMembership, otherMembership] = await Promise.all([
    prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: me.id } },
    }),
    prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: otherId } },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    }),
  ]);
  if (myMembership?.status !== "ACTIVE") {
    return jsonError("not_member", "Active membership required.", 403);
  }
  if (otherMembership?.status !== "ACTIVE") {
    return jsonError("not_found", "Member not found.", 404);
  }

  const conversationId = await findOrCreateDirect(tenant.id, me.id, otherId);
  const last = await prisma.chatMessage.findFirst({
    where: { tenantId: tenant.id, conversationId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  const roles = await roleMapFor(
    tenant.id,
    [otherId, ...(last ? [last.user.id] : [])],
  );

  const conversation: ConversationDto = {
    id: conversationId,
    type: "DIRECT",
    title: otherMembership.user.name,
    avatarUrl: otherMembership.user.avatarUrl,
    lastMessage: last
      ? {
          body: last.body,
          createdAt: last.createdAt.toISOString(),
          author: toAuthor(last.user, roles),
        }
      : null,
    spaceSlug: null,
  };
  return jsonOk({ conversation });
}
