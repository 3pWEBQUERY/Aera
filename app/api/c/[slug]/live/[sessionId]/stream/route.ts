import { subscribe, liveChannel } from "@/lib/realtime";
import { resolveLiveAccess } from "../_resolve";

/**
 * GET /api/c/:slug/live/:sessionId/stream — SSE stream of new live-chat
 * messages. Access is checked on connect (same gates as the REST route).
 */
export const dynamic = "force-dynamic";

const PING_MS = 25_000;
const MAX_AGE_MS = 15 * 60_000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params;
  const r = await resolveLiveAccess(slug, sessionId);
  if (!r) return new Response("forbidden", { status: 403 });

  const channel = liveChannel(r.community.tenant.id, r.sessionId);
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
          /* already closed */
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
