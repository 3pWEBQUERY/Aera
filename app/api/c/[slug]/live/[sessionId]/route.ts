import { NextResponse } from "next/server";
import { fetchLiveMessagesSince, fetchRecentLiveMessages, insertLiveMessage } from "@/lib/live";
import { publish, liveChannel } from "@/lib/realtime";
import { resolveLiveAccess } from "./_resolve";

// GET  /api/c/:slug/live/:sessionId           — latest live-chat messages
// GET  /api/c/:slug/live/:sessionId?after=<iso>  — poll for newer ones
// POST /api/c/:slug/live/:sessionId   { body }   — send a live-chat message

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params;
  const url = new URL(req.url);
  const after = url.searchParams.get("after");

  const r = await resolveLiveAccess(slug, sessionId);
  if (!r) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const messages = after
    ? await fetchLiveMessagesSince(r.community.tenant.id, r.sessionId, after)
    : await fetchRecentLiveMessages(r.community.tenant.id, r.sessionId);
  return NextResponse.json({ messages });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params;
  let payload: { body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const body = (payload.body ?? "").toString();
  if (!body.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  const r = await resolveLiveAccess(slug, sessionId);
  if (!r) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const message = await insertLiveMessage(
    r.community.tenant.id,
    r.sessionId,
    r.community.user!.id,
    body,
  );
  if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });
  await publish(liveChannel(r.community.tenant.id, r.sessionId), { message });
  return NextResponse.json({ message });
}
