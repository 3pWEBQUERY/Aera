import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";
import { studioLiveSessionDto } from "@/lib/mobile/live-studio";
import { getLiveInput, latestRecording } from "@/lib/cloudflare-stream";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

// GET   /api/mobile/v1/studio/{slug}/live/{sessionId}
//   → { session, whipUrl: string|null, connected: boolean }
//   Die WHIP-Adresse traegt ein Geheimnis: wer sie hat, sendet auf diesen
//   Eingang. Sie geht darum nur an Staff und nie in eine Mitglieder-Antwort.
// PATCH /api/mobile/v1/studio/{slug}/live/{sessionId}  { status }
//   → { session }   Live gehen bzw. beenden (wie setLiveStatusAction).

const patchSchema = z.object({ status: z.enum(["SCHEDULED", "LIVE", "ENDED"]) });

async function loadSession(tenantId: string, sessionId: string) {
  return prisma.liveSession.findFirst({
    where: { id: sessionId, tenantId },
    include: { space: { select: { slug: true } } },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant } = access;

  const session = await loadSession(tenant.id, sessionId);
  if (!session) return jsonError("not_found", "Live session not found.", 404);

  let whipUrl: string | null = null;
  let connected = false;
  if (session.source === "AERA" && session.cfInputId) {
    try {
      const input = await getLiveInput(session.cfInputId);
      whipUrl = input?.whipUrl ?? null;
      connected = input?.connected ?? false;
    } catch (error) {
      console.error("[live] Cloudflare Stream:", error);
      return jsonError("stream_failed", "Could not reach the live input.", 502);
    }
  }

  return jsonOk({
    session: studioLiveSessionDto(session, session.space?.slug ?? null),
    whipUrl,
    connected,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant } = access;

  const parsed = await parseJsonBody(req, patchSchema);
  if ("response" in parsed) return parsed.response;
  const status = parsed.data.status;

  const session = await loadSession(tenant.id, sessionId);
  if (!session) return jsonError("not_found", "Live session not found.", 404);

  // Beim Beenden gleich nach der Aufzeichnung sehen. Cloudflare braucht dafuer
  // meist ein paar Sekunden — findet sich noch nichts, bleibt `replayUrl` leer
  // und der naechste Aufruf holt es nach. Ein fehlendes Replay darf das
  // Beenden nicht aufhalten.
  let replay: { cfReplayId: string; replayUrl: string | null } | undefined;
  if (status === "ENDED" && session.cfInputId && !session.cfReplayId) {
    replay = await latestRecording(session.cfInputId)
      .then((rec) => (rec ? { cfReplayId: rec.uid, replayUrl: rec.hlsUrl } : undefined))
      .catch((error) => {
        console.error("[live] Cloudflare Stream:", error);
        return undefined;
      });
  }

  const updated = await prisma.liveSession.update({
    where: { id: session.id },
    data: {
      status,
      ...(status === "ENDED" ? { endedAt: new Date() } : {}),
      ...(status === "LIVE" ? { endedAt: null } : {}),
      ...(replay ?? {}),
    },
  });
  await writeAudit({
    tenantId: tenant.id,
    action: status === "LIVE" ? "live.start" : "live.status",
    targetType: "LiveSession",
    targetId: session.id,
  });
  // Die Web-Seiten der Community zeigen dieselbe Session — sie muessen den
  // Wechsel sofort sehen, sonst steht dort "geplant", waehrend gesendet wird.
  if (session.space) {
    revalidatePath(`/c/${slug}/s/${session.space.slug}`);
    revalidatePath(`/dashboard/${slug}/spaces/${session.space.slug}`);
  }
  revalidatePath(`/c/${slug}`);

  return jsonOk({ session: studioLiveSessionDto(updated, session.space?.slug ?? null) });
}
