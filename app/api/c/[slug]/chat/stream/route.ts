import { subscribe, chatChannel } from "@/lib/realtime";
import { resolveChatAccess } from "../_resolve";

/**
 * GET /api/c/:slug/chat/stream?space=<spaceId>|dm=<conversationId>
 *
 * Server-Sent-Events-Stream für neue Chat-Nachrichten. Zugriff wird beim
 * Verbindungsaufbau geprüft (gleiche Gates wie die REST-Route). Der Client
 * fällt bei Verbindungsproblemen automatisch auf Polling zurück.
 */

export const dynamic = "force-dynamic";

const PING_MS = 25_000;
/** Harte Obergrenze pro Verbindung — der Browser reconnectet transparent. */
const MAX_AGE_MS = 15 * 60_000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const r = await resolveChatAccess(
    slug,
    url.searchParams.get("space"),
    url.searchParams.get("dm"),
  );
  if (!r) return new Response("forbidden", { status: 403 });

  const channel = chatChannel(r.community.tenant.id, r.kind, r.id);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = subscribe(channel, (data) => {
        write(`data: ${JSON.stringify(data)}\n\n`);
      });
      // Keep-alive gegen Proxy-Timeouts.
      const ping = setInterval(() => write(": ping\n\n"), PING_MS);
      const maxAge = setTimeout(() => cleanup(), MAX_AGE_MS);

      function cleanup() {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(ping);
        clearTimeout(maxAge);
        try {
          controller.close();
        } catch {
          /* bereits geschlossen */
        }
      }

      req.signal.addEventListener("abort", cleanup);
      write(": connected\n\n");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
