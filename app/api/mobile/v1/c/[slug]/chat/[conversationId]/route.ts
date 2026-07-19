import prisma from "@/lib/prisma";
import { canAccess, type AccessContext } from "@/lib/entitlements";
import { parseChatSettings } from "@/lib/space-settings";
import { insertDirectMessage, insertSpaceMessage, lastMessageAt } from "@/lib/chat";
import { publish, chatChannel } from "@/lib/realtime";
import { z } from "zod";
import {
  jsonError,
  jsonOk,
  parseJsonBody,
  requireMobileAuth,
  resolveTenant,
} from "@/lib/mobile/api";
import { buildViewerContext, chatMessageDtos } from "@/lib/mobile/serializers";
import type { NextResponse } from "next/server";
import type { Tenant, User } from "@/app/generated/prisma/client";

// GET  /api/mobile/v1/c/{slug}/chat/{conversationId}?after={messageId} → { messages }
// POST /api/mobile/v1/c/{slug}/chat/{conversationId}  { body } → { message }
// {conversationId} ist entweder eine DIRECT-Conversation-ID oder die ID eines
// Gruppen-Chat-Spaces (Conversation.id der /chat-Liste). Zugriffs-Logik
// gespiegelt aus app/api/c/[slug]/chat/_resolve.ts (resolveChatAccess).

type Resolved =
  | { kind: "dm"; conversationId: string }
  | { kind: "space"; spaceId: string; settings: ReturnType<typeof parseChatSettings> };

async function resolveConversation(
  tenant: Tenant,
  ctx: AccessContext,
  user: User,
  conversationId: string,
): Promise<Resolved | null> {
  const dm = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      tenantId: tenant.id,
      kind: "DIRECT",
      members: { some: { userId: user.id } },
    },
    select: { id: true },
  });
  if (dm) return { kind: "dm", conversationId: dm.id };

  const space = await prisma.space.findFirst({
    where: { id: conversationId, tenantId: tenant.id, type: "CHAT", isArchived: false },
  });
  if (!space || !canAccess(space, ctx)) return null;
  return { kind: "space", spaceId: space.id, settings: parseChatSettings(space.settings) };
}

async function setup(
  req: Request,
  slug: string,
  conversationId: string,
): Promise<
  | { response: NextResponse }
  | { tenant: Tenant; user: User; ctx: AccessContext; target: Resolved }
> {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth;
  const tenant = await resolveTenant(slug);
  if (!tenant) return { response: jsonError("not_found", "Community not found.", 404) };
  const { ctx } = await buildViewerContext(tenant, auth.user);
  const target = await resolveConversation(tenant, ctx, auth.user, conversationId);
  if (!target) {
    return { response: jsonError("not_found", "Conversation not found.", 404) };
  }
  return { tenant, user: auth.user, ctx, target };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; conversationId: string }> },
) {
  const { slug, conversationId } = await params;
  const s = await setup(req, slug, conversationId);
  if ("response" in s) return s.response;
  const { tenant, user, target } = s;

  const afterId = new URL(req.url).searchParams.get("after");
  const scope =
    target.kind === "dm"
      ? { conversationId: target.conversationId }
      : { spaceId: target.spaceId };

  let after: Date | null = null;
  if (afterId) {
    const anchor = await prisma.chatMessage.findFirst({
      where: { id: afterId, tenantId: tenant.id, ...scope },
      select: { createdAt: true },
    });
    after = anchor?.createdAt ?? null;
  }

  // Ohne ?after: die letzten 80 Nachrichten; mit ?after: alles Neuere.
  const rows = after
    ? await prisma.chatMessage.findMany({
        where: { tenantId: tenant.id, ...scope, createdAt: { gt: after } },
        orderBy: { createdAt: "asc" },
        take: 200,
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
    : (
        await prisma.chatMessage.findMany({
          where: { tenantId: tenant.id, ...scope },
          orderBy: { createdAt: "desc" },
          take: 80,
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        })
      ).reverse();

  if (target.kind === "dm") {
    // Lese-Status wie getDirectThread (lib/chat.ts) fortschreiben.
    await prisma.conversationMember.updateMany({
      where: { tenantId: tenant.id, conversationId: target.conversationId, userId: user.id },
      data: { lastReadAt: new Date() },
    });
  }

  return jsonOk({ messages: await chatMessageDtos(tenant.id, rows, user.id) });
}

const postSchema = z.object({ body: z.string().min(1).max(4000) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; conversationId: string }> },
) {
  const { slug, conversationId } = await params;
  const s = await setup(req, slug, conversationId);
  if ("response" in s) return s.response;
  const { tenant, user, ctx, target } = s;

  const parsed = await parseJsonBody(req, postSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data.body;

  if (target.kind === "dm") {
    const message = await insertDirectMessage(tenant.id, target.conversationId, user.id, body);
    if (!message) return jsonError("validation", "Message must not be empty.", 400);
    await publish(chatChannel(tenant.id, "dm", target.conversationId), { message });
    const [dto] = await chatMessageDtos(tenant.id, [message], user.id);
    return jsonOk({ message: dto });
  }

  // Gruppen-Chat: Post-Policy + Slow-Mode wie die Web-Chat-Route.
  if (target.settings.postPolicy === "STAFF" && !ctx.isStaff) {
    return jsonError("not_member", "Only staff can post in this chat.", 403);
  }
  if (target.settings.slowModeSeconds > 0 && !ctx.isStaff) {
    const last = await lastMessageAt(tenant.id, target.spaceId, user.id);
    if (last) {
      const elapsed = Date.now() - last.getTime();
      const windowMs = target.settings.slowModeSeconds * 1000;
      if (elapsed < windowMs) {
        return jsonError(
          "rate_limited",
          `Slow mode: wait ${Math.ceil((windowMs - elapsed) / 1000)}s before posting again.`,
          429,
        );
      }
    }
  }
  const message = await insertSpaceMessage(
    tenant.id,
    target.spaceId,
    user.id,
    body,
    target.settings.maxMessageLength,
  );
  if (!message) return jsonError("validation", "Message must not be empty.", 400);
  await publish(chatChannel(tenant.id, "space", target.spaceId), { message });
  const [dto] = await chatMessageDtos(tenant.id, [message], user.id);
  return jsonOk({ message: dto });
}
