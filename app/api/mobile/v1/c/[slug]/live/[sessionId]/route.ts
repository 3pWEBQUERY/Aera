import { z } from "zod";
import prisma from "@/lib/prisma";
import { canAccess, type AccessContext } from "@/lib/entitlements";
import { publish, liveChannel } from "@/lib/realtime";
import {
  jsonError,
  jsonOk,
  parseJsonBody,
  requireMobileAuth,
  resolveTenant,
} from "@/lib/mobile/api";
import { buildViewerContext, chatMessageDtos } from "@/lib/mobile/serializers";
import type { NextResponse } from "next/server";
import type { LiveSession, Tenant, User } from "@/app/generated/prisma/client";

// GET  /api/mobile/v1/c/{slug}/live/{sessionId}?after={messageId} → { session, messages }
// POST /api/mobile/v1/c/{slug}/live/{sessionId}  { body } → { message }
// Zugriffs-Logik gespiegelt aus app/api/c/[slug]/live/[sessionId]/_resolve.ts:
// Space-Gate + optionaler Session-Entitlement-Key.

const MAX_LIVE_MESSAGE = 1000;

async function setup(
  req: Request,
  slug: string,
  sessionId: string,
): Promise<
  | { response: NextResponse }
  | { tenant: Tenant; user: User; ctx: AccessContext; session: LiveSession }
> {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth;
  const tenant = await resolveTenant(slug);
  if (!tenant) return { response: jsonError("not_found", "Community not found.", 404) };

  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, tenantId: tenant.id },
    include: { space: true },
  });
  if (!session || !session.space) {
    return { response: jsonError("not_found", "Live session not found.", 404) };
  }
  const { ctx } = await buildViewerContext(tenant, auth.user);
  if (!canAccess(session.space, ctx)) {
    const isActiveMember = ctx.membership?.status === "ACTIVE";
    return {
      response: jsonError(
        isActiveMember ? "payment_required" : "not_member",
        "You do not have access to this live session.",
        403,
      ),
    };
  }
  if (
    session.requiredEntitlementKey &&
    !ctx.isStaff &&
    !ctx.keys.has(session.requiredEntitlementKey)
  ) {
    return {
      response: jsonError("payment_required", "This session requires a higher tier.", 403),
    };
  }
  return { tenant, user: auth.user, ctx, session };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params;
  const s = await setup(req, slug, sessionId);
  if ("response" in s) return s.response;
  const { tenant, user, session } = s;

  const afterId = new URL(req.url).searchParams.get("after");
  let after: Date | null = null;
  if (afterId) {
    const anchor = await prisma.liveChatMessage.findFirst({
      where: { id: afterId, tenantId: tenant.id, sessionId: session.id },
      select: { createdAt: true },
    });
    after = anchor?.createdAt ?? null;
  }
  const rows = after
    ? await prisma.liveChatMessage.findMany({
        where: { tenantId: tenant.id, sessionId: session.id, createdAt: { gt: after } },
        orderBy: { createdAt: "asc" },
        take: 200,
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
    : (
        await prisma.liveChatMessage.findMany({
          where: { tenantId: tenant.id, sessionId: session.id },
          orderBy: { createdAt: "desc" },
          take: 80,
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        })
      ).reverse();

  return jsonOk({
    session: {
      id: session.id,
      title: session.title,
      description: null,
      status: session.status,
      scheduledAt: session.startsAt ? session.startsAt.toISOString() : null,
      streamUrl: session.streamUrl,
      replayUrl: session.replayUrl,
      accessible: true,
    },
    messages: await chatMessageDtos(tenant.id, rows, user.id),
  });
}

const postSchema = z.object({ body: z.string().min(1).max(MAX_LIVE_MESSAGE) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params;
  const s = await setup(req, slug, sessionId);
  if ("response" in s) return s.response;
  const { tenant, user, ctx, session } = s;

  // Chatten dürfen aktive Mitglieder und Staff (wie LiveRoom im Web).
  if (ctx.membership?.status !== "ACTIVE" && !ctx.isStaff) {
    return jsonError("not_member", "Active membership required to chat.", 403);
  }

  const parsed = await parseJsonBody(req, postSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data.body.trim().slice(0, MAX_LIVE_MESSAGE);
  if (!body) return jsonError("validation", "Message must not be empty.", 400);

  const message = await prisma.liveChatMessage.create({
    data: { tenantId: tenant.id, sessionId: session.id, userId: user.id, body },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  publish(liveChannel(tenant.id, session.id), {
    message: {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      user: { name: message.user.name, avatarUrl: message.user.avatarUrl },
    },
  });
  const [dto] = await chatMessageDtos(tenant.id, [message], user.id);
  return jsonOk({ message: dto });
}
