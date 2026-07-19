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
    async start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      const timers: {
        ping?: ReturnType<typeof setInterval>;
        maxAge?: ReturnType<typeof setTimeout>;
      } = {};
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      function cleanup() {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (timers.ping) clearInterval(timers.ping);
        if (timers.maxAge) clearTimeout(timers.maxAge);
        req.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }

      req.signal.addEventListener("abort", cleanup, { once: true });
      unsubscribe = await subscribe(channel, (data) => {
        write(`data: ${JSON.stringify(data)}\n\n`);
      });
      if (closed) {
        unsubscribe();
        return;
      }
      timers.ping = setInterval(() => write(": ping\n\n"), PING_MS);
      timers.maxAge = setTimeout(() => cleanup(), MAX_AGE_MS);
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
