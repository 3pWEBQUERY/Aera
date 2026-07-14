import "server-only";
import { EventEmitter } from "node:events";

/**
 * In-Process-Pub/Sub für Echtzeit-Features (SSE).
 *
 * Nachrichten werden beim Schreiben veröffentlicht; offene SSE-Streams des
 * gleichen Prozesses abonnieren den Kanal. Das trägt eine einzelne Instanz
 * (Railway-Standard) ohne zusätzliche Infrastruktur. Für horizontale
 * Skalierung denselben API-Umriss auf Redis Pub/Sub umstellen.
 */

const g = globalThis as unknown as { __aeraRealtimeBus?: EventEmitter };

function bus(): EventEmitter {
  if (!g.__aeraRealtimeBus) {
    g.__aeraRealtimeBus = new EventEmitter();
    // Viele parallele SSE-Verbindungen sind normal — kein Listener-Limit.
    g.__aeraRealtimeBus.setMaxListeners(0);
  }
  return g.__aeraRealtimeBus;
}

export function publish(channel: string, data: unknown): void {
  bus().emit(channel, data);
}

/** Abonniert einen Kanal; Rückgabe ist die Unsubscribe-Funktion. */
export function subscribe(
  channel: string,
  listener: (data: unknown) => void,
): () => void {
  bus().on(channel, listener);
  return () => bus().off(channel, listener);
}

/** Kanalname für Gruppen-Chats (space) bzw. Direktnachrichten (dm). */
export function chatChannel(
  tenantId: string,
  kind: "space" | "dm",
  id: string,
): string {
  return `chat:${tenantId}:${kind}:${id}`;
}

/** Kanalname für den Live-Chat einer Live-Session. */
export function liveChannel(tenantId: string, sessionId: string): string {
  return `live:${tenantId}:${sessionId}`;
}
