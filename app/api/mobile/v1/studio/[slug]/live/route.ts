import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";
import { studioLiveSessionDto } from "@/lib/mobile/live-studio";
import { newRoomName } from "@/lib/live";
import { createLiveInput, streamLiveEnabled } from "@/lib/cloudflare-stream";
import { writeAudit } from "@/lib/audit";

// GET  /api/mobile/v1/studio/{slug}/live
//   → { spaces: [{ slug, name }], sessions: StudioLiveSession[] }
// POST /api/mobile/v1/studio/{slug}/live
//   { spaceSlug, title, startsAt?, requiredEntitlementKey? } → { session }
//
// Der Creator sendet aus der App wie im Web-Studio: eigener Stream ueber Aera
// (`source: AERA`), Bild und Ton kommen aus dem Geraet (`ingest: BROWSER`).
// Der Weg ueber eine Sendesoftware bleibt dem Dashboard vorbehalten — auf dem
// Telefon gibt es keine.
// Persistenz gespiegelt aus createLiveSessionAction (app/actions/live.ts).

const createSchema = z.object({
  spaceSlug: z.string().min(1),
  title: z.string().min(2).max(200),
  /** ISO-8601; in der Zukunft = geplante Session. */
  startsAt: z.string().optional(),
  requiredEntitlementKey: z.string().max(200).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant } = access;

  const spaces = await prisma.space.findMany({
    where: { tenantId: tenant.id, type: "LIVE", isArchived: false },
    orderBy: { sortOrder: "asc" },
  });
  const sessions = spaces.length
    ? await prisma.liveSession.findMany({
        where: { tenantId: tenant.id, spaceId: { in: spaces.map((s) => s.id) } },
        orderBy: [{ status: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }],
        take: 50,
      })
    : [];
  const spaceSlugs = new Map(spaces.map((s) => [s.id, s.slug]));

  return jsonOk({
    spaces: spaces.map((s) => ({ slug: s.slug, name: s.name })),
    sessions: sessions.map((s) =>
      studioLiveSessionDto(s, s.spaceId ? (spaceSlugs.get(s.spaceId) ?? null) : null),
    ),
    streamEnabled: streamLiveEnabled(),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant, user } = access;

  const parsed = await parseJsonBody(req, createSchema);
  if ("response" in parsed) return parsed.response;
  const { title, spaceSlug } = parsed.data;

  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, slug: spaceSlug, type: "LIVE", isArchived: false },
  });
  if (!space) return jsonError("not_found", "Live space not found.", 404);
  if (!streamLiveEnabled()) {
    return jsonError("stream_not_configured", "Streaming is not configured.", 409);
  }

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) {
    return jsonError("validation", "startsAt must be an ISO-8601 date.", 400);
  }

  // Erst der Live-Eingang bei Cloudflare, dann die Session: ein Datensatz ohne
  // Eingang waere eine Session, die man nicht senden kann, aber im Kalender
  // steht.
  let cfInputId: string;
  try {
    const created = await createLiveInput({
      name: `${tenant.slug} · ${title}`,
      // Beim Senden aus dem Geraet laeuft die Wiedergabe ueber WebRTC; dort
      // gibt Cloudflare (Beta) keine signierten Adressen aus. Geschuetzt wird
      // sie dadurch, dass die Wiedergabe-Adresse nur an Berechtigte geht.
      requireSignedURLs: false,
    });
    cfInputId = created.uid;
  } catch (error) {
    console.error("[live] Cloudflare Stream:", error);
    return jsonError("stream_failed", "Could not create the live input.", 502);
  }

  const session = await prisma.liveSession.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      title: title.trim(),
      status: "SCHEDULED",
      source: "AERA",
      ingest: "BROWSER",
      cfInputId,
      roomName: newRoomName(),
      hostId: user.id,
      requiredEntitlementKey: parsed.data.requiredEntitlementKey?.trim() || null,
      startsAt,
    },
  });
  await writeAudit({
    tenantId: tenant.id,
    action: "live.create",
    targetType: "LiveSession",
    targetId: session.id,
  });

  return jsonOk({ session: studioLiveSessionDto(session, space.slug) });
}
