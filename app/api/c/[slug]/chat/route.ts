import { NextResponse } from "next/server";
import {
  fetchSpaceMessagesSince,
  insertSpaceMessage,
  lastMessageAt,
  fetchDirectSince,
  insertDirectMessage,
} from "@/lib/chat";
import { publish, chatChannel } from "@/lib/realtime";
import { resolveChatAccess } from "./_resolve";

// GET  /api/c/:slug/chat?space=<spaceId>|dm=<conversationId>&after=<iso>
// POST /api/c/:slug/chat   { space | dm, body }
//
// Group chats are gated by the space's visibility (+ chat post policy / slow
// mode); direct messages require the caller to be a participant.
// Live-Updates laufen primär über /chat/stream (SSE); GET bleibt als
// Polling-Fallback erhalten.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const after = url.searchParams.get("after") ?? new Date(0).toISOString();

  const r = await resolveChatAccess(
    slug,
    url.searchParams.get("space"),
    url.searchParams.get("dm"),
  );
  if (!r) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const messages =
    r.kind === "space"
      ? await fetchSpaceMessagesSince(r.community.tenant.id, r.id, after)
      : await fetchDirectSince(r.community.tenant.id, r.id, after);
  return NextResponse.json({ messages });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let payload: { space?: string; dm?: string; body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const body = (payload.body ?? "").toString();
  if (!body.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  const r = await resolveChatAccess(slug, payload.space ?? null, payload.dm ?? null);
  if (!r) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const userId = r.community.user!.id;

  if (r.kind === "dm") {
    const message = await insertDirectMessage(r.community.tenant.id, r.id, userId, body);
    if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });
    publish(chatChannel(r.community.tenant.id, "dm", r.id), { message });
    return NextResponse.json({ message });
  }

  // Group chat: post policy + slow mode.
  const isStaff = r.community.ctx.isStaff;
  if (r.settings.postPolicy === "STAFF" && !isStaff) {
    return NextResponse.json({ error: "read-only" }, { status: 403 });
  }
  if (r.settings.slowModeSeconds > 0 && !isStaff) {
    const last = await lastMessageAt(r.community.tenant.id, r.id, userId);
    if (last) {
      const elapsed = Date.now() - last.getTime();
      const windowMs = r.settings.slowModeSeconds * 1000;
      if (elapsed < windowMs) {
        return NextResponse.json(
          { error: "slow-mode", retryAfter: Math.ceil((windowMs - elapsed) / 1000) },
          { status: 429 },
        );
      }
    }
  }
  const message = await insertSpaceMessage(
    r.community.tenant.id,
    r.id,
    userId,
    body,
    r.settings.maxMessageLength,
  );
  if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });
  publish(chatChannel(r.community.tenant.id, "space", r.id), { message });
  return NextResponse.json({ message });
}
