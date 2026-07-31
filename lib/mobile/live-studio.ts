import "server-only";
import { env } from "@/lib/env";
import type { LiveSession } from "@/app/generated/prisma/client";

/**
 * Die Live-Session aus Sicht des Creators.
 *
 * Bewusst schmaler als die Mitglieder-Sicht: hier zaehlt, ob gesendet werden
 * kann und was gerade laeuft — nicht, wo das Bild herkommt.
 */
export interface StudioLiveSessionDto {
  id: string;
  title: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  source: "AERA" | "EXTERNAL";
  ingest: "BROWSER" | "OBS";
  spaceSlug: string | null;
  startsAt: string | null;
  endedAt: string | null;
  /**
   * Kann aus der App gesendet werden? Nur eigene Streams, die aus dem Geraet
   * kommen — fuer eine fremde Plattform oder eine Sendesoftware gibt es auf
   * dem Telefon nichts zu tun.
   */
  canBroadcast: boolean;
  /** Adresse des Studios im WebView (Token traegt die App selbst bei). */
  studioUrl: string;
}

export function studioLiveSessionDto(
  session: LiveSession,
  spaceSlug: string | null,
): StudioLiveSessionDto {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    source: session.source,
    ingest: session.ingest,
    spaceSlug,
    startsAt: session.startsAt ? session.startsAt.toISOString() : null,
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    canBroadcast:
      session.source === "AERA" && session.ingest === "BROWSER" && Boolean(session.cfInputId),
    studioUrl: studioUrl(session.id),
  };
}

/**
 * Das Studio laeuft als schmale Seite im WebView der App.
 *
 * Warum nicht nativ: Senden heisst WebRTC (WHIP), und den Stack gibt es auf
 * dem Telefon nur im WebView. Dieselbe Seite, dieselbe Handshake-Logik wie im
 * Browser-Studio — kein zweiter Weg, der eigene Fehler haben kann.
 *
 * In der Adresse steht nur die Session. Token und Community-Slug schiebt die
 * App vor dem Laden ins Fenster — nichts Auth-Relevantes landet so in
 * Server-Logs oder im Verlauf.
 */
function studioUrl(sessionId: string): string {
  const base = env.APP_URL.replace(/\/$/, "");
  return `${base}/live-studio?session=${encodeURIComponent(sessionId)}`;
}
