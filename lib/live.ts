import "server-only";
import prisma from "./prisma";
import {
  getLiveInput,
  playbackToken,
  streamHlsUrl,
  streamIframeUrl,
  streamLiveEnabled,
} from "./cloudflare-stream";
import { detectLivePlatform, toLiveEmbedUrl, type LivePlatform } from "./live-embed";
import type { LiveIngest, LiveSource, LiveStatus } from "@/app/generated/prisma/client";

export interface LiveSessionData {
  id: string;
  title: string;
  status: LiveStatus;
  source: LiveSource;
  ingest: LiveIngest;
  cfInputId: string | null;
  cfReplayId: string | null;
  streamUrl: string | null;
  replayUrl: string | null;
  requiredEntitlementKey: string | null;
  startsAt: Date | null;
  endedAt: Date | null;
}

/**
 * Die Adresse, die im Player steht.
 *
 * Bei einem eigenen Stream zeigt sie auf Cloudflare — auf den Live-Eingang,
 * solange gesendet wird, danach auf die Aufzeichnung. Setzt die Session Rechte
 * voraus, wird die ID durch ein kurzlebiges Token ersetzt: eine kopierte
 * Adresse laeuft dann von selbst ab, statt den bezahlten Stream weiterzugeben.
 *
 * Fremde Plattformen gehen unveraendert durch; daraus macht der Live-Raum
 * clientseitig die passende Einbettung.
 */
export interface LivePlayback {
  /** Adresse fuer den eingebetteten Cloudflare-Player (HLS). */
  embedUrl?: string | null;
  /**
   * WHEP-Adresse fuer einen Stream, der gerade aus dem Browser gesendet wird.
   * Wird nur an Berechtigte ausgeliefert — bei WebRTC gibt es (Beta) keine
   * signierten Adressen, der Schutz liegt also darin, sie gar nicht erst
   * herauszugeben.
   */
  whepUrl?: string | null;
}

export async function livePlayback(s: LiveSessionData): Promise<LivePlayback> {
  // Ein laufender Browser-Stream wird ueber WebRTC gesehen, nicht ueber HLS —
  // Cloudflare mischt die beiden Wege nicht.
  if (s.source === "AERA" && s.ingest === "BROWSER" && s.status === "LIVE" && s.cfInputId) {
    if (!streamLiveEnabled()) return {};
    const input = await getLiveInput(s.cfInputId).catch(() => null);
    return { whepUrl: input?.whepUrl ?? null };
  }

  const id = s.status === "ENDED" ? (s.cfReplayId ?? s.cfInputId) : s.cfInputId;
  if (s.source !== "AERA" || !id || !streamLiveEnabled()) {
    return {
      embedUrl:
        s.status === "ENDED" ? (s.replayUrl ?? s.streamUrl) : (s.streamUrl ?? s.replayUrl),
    };
  }
  if (!s.requiredEntitlementKey) return { embedUrl: streamIframeUrl(id) };
  try {
    return { embedUrl: streamIframeUrl(await playbackToken(id)) };
  } catch {
    // Ohne Token bleibt der Player leer — besser als eine offene Adresse,
    // die den geschuetzten Stream fuer jeden abspielbar macht.
    return {};
  }
}

/**
 * Was die iOS-App braucht, um ein Bild zu zeigen.
 *
 * Der Browser bekommt bei eigenen Streams WebRTC (WHEP) — unter einer
 * Sekunde Verzoegerung, dafuer nur im Browser. Auf dem Telefon gibt es
 * keinen WebRTC-Stack, also liefert die App-Antwort HLS: dieselbe Sendung,
 * ein paar Sekunden spaeter, dafuer nativ in AVPlayer abspielbar.
 *
 * Fremde Plattformen kommen als fertige Einbettungsadresse — Twitch braucht
 * dafuer den Host der einbettenden Seite, den die App nicht kennt.
 */
export interface LiveMobilePlayback {
  /** HLS-Adresse (eigener Stream, live oder Aufzeichnung). */
  hlsUrl: string | null;
  /** Einbettungsadresse einer fremden Plattform. */
  embedUrl: string | null;
  /** Erkannte Plattform der Einbettung, `null` bei eigenem Stream. */
  platform: LivePlatform | null;
}

export async function liveMobilePlayback(
  s: LiveSessionData,
  parentHost: string,
): Promise<LiveMobilePlayback> {
  const empty: LiveMobilePlayback = { hlsUrl: null, embedUrl: null, platform: null };

  if (s.source === "AERA" && streamLiveEnabled()) {
    // Solange gesendet wird, laeuft die Wiedergabe ueber den Live-Eingang;
    // danach ueber die Aufzeichnung.
    const id = s.status === "ENDED" ? (s.cfReplayId ?? s.cfInputId) : s.cfInputId;
    if (!id) return empty;
    if (!s.requiredEntitlementKey) return { ...empty, hlsUrl: streamHlsUrl(id) };
    try {
      return { ...empty, hlsUrl: streamHlsUrl(await playbackToken(id)) };
    } catch {
      // Ohne Token bleibt der Player leer — besser als eine offene Adresse.
      return empty;
    }
  }

  const raw = s.status === "ENDED" ? (s.replayUrl ?? s.streamUrl) : (s.streamUrl ?? s.replayUrl);
  if (!raw) return empty;
  return {
    hlsUrl: null,
    embedUrl: toLiveEmbedUrl(raw, parentHost),
    platform: detectLivePlatform(raw),
  };
}

export interface LiveMessageData {
  id: string;
  body: string;
  createdAt: Date;
  user: { name: string; avatarUrl: string | null };
}

const MAX_LIVE_MESSAGE = 1000;

/** All sessions in a LIVE space, upcoming/live first, then ended. */
export async function listLiveSessions(
  tenantId: string,
  spaceId: string,
): Promise<LiveSessionData[]> {
  const rows = await prisma.liveSession.findMany({
    where: { tenantId, spaceId },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    source: s.source,
    ingest: s.ingest,
    cfInputId: s.cfInputId,
    cfReplayId: s.cfReplayId,
    streamUrl: s.streamUrl,
    replayUrl: s.replayUrl,
    requiredEntitlementKey: s.requiredEntitlementKey,
    startsAt: s.startsAt,
    endedAt: s.endedAt,
  }));
}

export async function getLiveSession(
  tenantId: string,
  sessionId: string,
): Promise<LiveSessionData | null> {
  const s = await prisma.liveSession.findFirst({ where: { id: sessionId, tenantId } });
  if (!s) return null;
  return {
    id: s.id,
    title: s.title,
    status: s.status,
    source: s.source,
    ingest: s.ingest,
    cfInputId: s.cfInputId,
    cfReplayId: s.cfReplayId,
    streamUrl: s.streamUrl,
    replayUrl: s.replayUrl,
    requiredEntitlementKey: s.requiredEntitlementKey,
    startsAt: s.startsAt,
    endedAt: s.endedAt,
  };
}

export async function fetchLiveMessagesSince(
  tenantId: string,
  sessionId: string,
  afterIso: string,
): Promise<LiveMessageData[]> {
  const after = new Date(afterIso);
  const rows = await prisma.liveChatMessage.findMany({
    where: {
      tenantId,
      sessionId,
      ...(Number.isNaN(after.getTime()) ? {} : { createdAt: { gt: after } }),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { user: { select: { name: true, avatarUrl: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    user: { name: m.user.name, avatarUrl: m.user.avatarUrl },
  }));
}

export async function fetchRecentLiveMessages(
  tenantId: string,
  sessionId: string,
  limit = 80,
): Promise<LiveMessageData[]> {
  const rows = await prisma.liveChatMessage.findMany({
    where: { tenantId, sessionId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, avatarUrl: true } } },
  });
  return rows
    .reverse()
    .map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      user: { name: m.user.name, avatarUrl: m.user.avatarUrl },
    }));
}

export async function insertLiveMessage(
  tenantId: string,
  sessionId: string,
  userId: string,
  body: string,
): Promise<LiveMessageData | null> {
  const text = body.trim().slice(0, MAX_LIVE_MESSAGE);
  if (!text) return null;
  const m = await prisma.liveChatMessage.create({
    data: { tenantId, sessionId, userId, body: text },
    include: { user: { select: { name: true, avatarUrl: true } } },
  });
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    user: { name: m.user.name, avatarUrl: m.user.avatarUrl },
  };
}

/** Short random room identifier for a new live session. */
export function newRoomName(): string {
  return `room_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
