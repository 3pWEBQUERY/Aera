"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { tErr } from "@/lib/action-errors";
import { newRoomName } from "@/lib/live";
import {
  CloudflareStreamError,
  createLiveInput,
  deleteLiveInput,
  getLiveInput,
  latestRecording,
  streamLiveEnabled,
} from "@/lib/cloudflare-stream";
import type { LiveSource, LiveStatus } from "@/app/generated/prisma/client";

export interface ActionState {
  ok?: boolean;
  error?: string;
}

const ok: ActionState = { ok: true };

function parseDate(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseSource(raw: unknown): LiveSource {
  return String(raw ?? "") === "AERA" ? "AERA" : "EXTERNAL";
}

/**
 * Cloudflare-Fehler in eine Meldung uebersetzen, die im Formular etwas taugt.
 * Der Fehlertext von Cloudflare ist englisch und technisch; er hilft beim
 * Nachsehen im Log, nicht dem Creator vor dem Bildschirm.
 */
function streamError(error: unknown): string {
  if (error instanceof CloudflareStreamError) {
    console.error(`[live] Cloudflare Stream ${error.status}: ${error.message}`);
    return error.status === 504 ? "streamUnreachable" : "streamFailed";
  }
  console.error("[live] Cloudflare Stream:", error);
  return "streamFailed";
}

/** Create a scheduled/live session inside a LIVE space. Staff only. */
export async function createLiveSessionAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: await tErr("spaceNotFound") };

  const title = String(fd.get("title") || "").trim();
  if (title.length < 2) return { error: await tErr("titleRequired") };

  const source = parseSource(fd.get("source"));
  const requiredEntitlementKey = String(fd.get("requiredEntitlementKey") || "") || null;

  // Bei einem eigenen Stream entsteht zuerst der Live-Input bei Cloudflare.
  // Erst danach die Session anlegen: ein Datensatz ohne Input waere eine
  // Session, die man nicht senden kann, aber im Kalender steht.
  let cfInputId: string | null = null;
  if (source === "AERA") {
    if (!streamLiveEnabled()) return { error: await tErr("streamNotConfigured") };
    try {
      const created = await createLiveInput({
        name: `${tenant.slug} · ${title}`,
        // Ein Stream mit Zugangsvoraussetzung darf sich nicht weitergeben
        // lassen — sonst ist die Bezahlschranke eine Empfehlung.
        requireSignedURLs: !!requiredEntitlementKey,
      });
      cfInputId = created.uid;
    } catch (error) {
      return { error: await tErr(streamError(error)) };
    }
  }

  const session = await prisma.liveSession.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      title,
      status: "SCHEDULED",
      source,
      cfInputId,
      roomName: newRoomName(),
      hostId: user.id,
      streamUrl: source === "AERA" ? null : String(fd.get("streamUrl") || "") || null,
      requiredEntitlementKey,
      startsAt: parseDate(fd.get("startsAt")),
    },
  });
  await writeAudit({
    tenantId: tenant.id,
    action: "live.create",
    targetType: "LiveSession",
    targetId: session.id,
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

/** Change a session's status (go live / end) and optionally set the replay URL. */
export async function updateLiveSessionAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const sessionId = String(fd.get("sessionId"));
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, tenantId: tenant.id },
    include: { space: { select: { slug: true } } },
  });
  if (!session) return { error: await tErr("liveSessionNotFound") };

  const rawStatus = String(fd.get("status") || "");
  const status: LiveStatus | undefined =
    rawStatus === "SCHEDULED" || rawStatus === "LIVE" || rawStatus === "ENDED"
      ? rawStatus
      : undefined;
  const title = String(fd.get("title") || "").trim();

  // Die Quelle darf sich aendern. Dabei entsteht bzw. verschwindet ein
  // Live-Input — beides muss geschehen sein, bevor der Datensatz umgestellt
  // wird, sonst zeigt die Session auf einen Eingang, den es nicht gibt.
  const source = fd.get("source") !== null ? parseSource(fd.get("source")) : session.source;
  let cfInputId = session.cfInputId;
  if (source !== session.source) {
    try {
      if (source === "AERA") {
        if (!streamLiveEnabled()) return { error: await tErr("streamNotConfigured") };
        const created = await createLiveInput({
          name: `${tenant.slug} · ${title || session.title}`,
          requireSignedURLs: !!(fd.get("requiredEntitlementKey") ?? session.requiredEntitlementKey),
        });
        cfInputId = created.uid;
      } else if (cfInputId) {
        await deleteLiveInput(cfInputId);
        cfInputId = null;
      }
    } catch (error) {
      return { error: await tErr(streamError(error)) };
    }
  }

  await prisma.liveSession.update({
    where: { id: session.id },
    data: {
      ...(title.length >= 2 ? { title } : {}),
      ...(status ? { status } : {}),
      ...(status === "ENDED" ? { endedAt: new Date() } : {}),
      source,
      cfInputId,
      // Eine fremde Adresse hat bei einem eigenen Stream nichts zu suchen.
      ...(source === "AERA"
        ? { streamUrl: null }
        : fd.get("streamUrl") !== null
          ? { streamUrl: String(fd.get("streamUrl")) || null }
          : {}),
      ...(fd.get("replayUrl") !== null ? { replayUrl: String(fd.get("replayUrl")) || null } : {}),
      ...(fd.get("startsAt") !== null ? { startsAt: parseDate(fd.get("startsAt")) } : {}),
    },
  });
  if (session.space) {
    revalidatePath(`/dashboard/${slug}/spaces/${session.space.slug}`);
    revalidatePath(`/c/${slug}/s/${session.space.slug}`);
  }
  return ok;
}

export async function deleteLiveSessionAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const sessionId = String(fd.get("sessionId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const session = await prisma.liveSession.findFirst({ where: { id: sessionId, tenantId: tenant.id } });
  if (session) {
    // Den Live-Input mit aufraeumen, sonst sammeln sich bei Cloudflare
    // Eingaenge an, die niemand mehr zuordnen kann. Scheitert das, wird
    // trotzdem geloescht — der verwaiste Input kostet nichts.
    if (session.cfInputId) {
      await deleteLiveInput(session.cfInputId).catch((error) => streamError(error));
    }
    await prisma.liveSession.delete({ where: { id: session.id } });
  }
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}

// ---------------------------------------------------------------- Senden

export interface IngestInfo {
  /** rtmps://live.cloudflare.com:443/live/ */
  url: string;
  /** Sendeschluessel. Kommt live von Cloudflare, liegt nirgends bei uns. */
  key: string;
  srtUrl: string | null;
  srtPassphrase: string | null;
  /** true, sobald OBS o. ae. verbunden ist. */
  connected: boolean;
}

/**
 * Zugangsdaten fuer die Sendesoftware.
 *
 * Bewusst eine eigene Abfrage statt eines Feldes im Formular: der Schluessel
 * soll nur dann ueber die Leitung gehen, wenn ihn jemand tatsaechlich sehen
 * will, und nur fuer Staff dieser Community.
 */
export async function liveIngestAction(
  fd: FormData,
): Promise<{ info?: IngestInfo; error?: string }> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const session = await prisma.liveSession.findFirst({
    where: { id: String(fd.get("sessionId")), tenantId: tenant.id },
    select: { cfInputId: true },
  });
  if (!session?.cfInputId) return { error: await tErr("liveSessionNotFound") };
  try {
    const input = await getLiveInput(session.cfInputId);
    if (!input) return { error: await tErr("streamInputGone") };
    return {
      info: {
        url: input.ingestUrl,
        key: input.streamKey,
        srtUrl: input.srtUrl,
        srtPassphrase: input.srtPassphrase,
        connected: input.connected,
      },
    };
  } catch (error) {
    return { error: await tErr(streamError(error)) };
  }
}

/**
 * Live gehen bzw. beenden.
 *
 * Beim Beenden wird gleich nach der Aufzeichnung gesehen. Cloudflare braucht
 * dafuer meist ein paar Sekunden — findet sich noch nichts, bleibt `replayUrl`
 * leer und der naechste Aufruf holt es nach. Ein fehlendes Replay darf das
 * Beenden nicht aufhalten.
 */
export async function setLiveStatusAction(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const raw = String(fd.get("status") || "");
  if (raw !== "SCHEDULED" && raw !== "LIVE" && raw !== "ENDED") {
    return { error: await tErr("invalidInput") };
  }
  const status: LiveStatus = raw;
  const session = await prisma.liveSession.findFirst({
    where: { id: String(fd.get("sessionId")), tenantId: tenant.id },
    include: { space: { select: { slug: true } } },
  });
  if (!session) return { error: await tErr("liveSessionNotFound") };

  let replay: { cfReplayId: string; replayUrl: string | null } | undefined;
  if (status === "ENDED" && session.cfInputId && !session.cfReplayId) {
    replay = await latestRecording(session.cfInputId)
      .then((rec) => (rec ? { cfReplayId: rec.uid, replayUrl: rec.hlsUrl } : undefined))
      .catch((error) => {
        streamError(error);
        return undefined;
      });
  }

  await prisma.liveSession.update({
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
  if (session.space) {
    revalidatePath(`/dashboard/${slug}/spaces/${session.space.slug}`);
    revalidatePath(`/c/${slug}/s/${session.space.slug}`);
  }
  revalidatePath(`/c/${slug}`);
  return { ok: true };
}

/**
 * Aufzeichnung nachtraeglich holen — fuer den Fall, dass sie beim Beenden noch
 * nicht fertig war.
 */
export async function fetchReplayAction(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const session = await prisma.liveSession.findFirst({
    where: { id: String(fd.get("sessionId")), tenantId: tenant.id },
    include: { space: { select: { slug: true } } },
  });
  if (!session?.cfInputId) return { error: await tErr("liveSessionNotFound") };
  try {
    const rec = await latestRecording(session.cfInputId);
    if (!rec) return { error: await tErr("streamReplayPending") };
    await prisma.liveSession.update({
      where: { id: session.id },
      data: { cfReplayId: rec.uid, replayUrl: rec.hlsUrl },
    });
    if (session.space) {
      revalidatePath(`/dashboard/${slug}/spaces/${session.space.slug}`);
      revalidatePath(`/c/${slug}/s/${session.space.slug}`);
    }
    return { ok: true };
  } catch (error) {
    return { error: await tErr(streamError(error)) };
  }
}
