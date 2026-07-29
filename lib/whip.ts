/**
 * WHIP und WHEP — die beiden HTTP-Handgriffe rund um WebRTC.
 *
 * Beide bestehen aus genau einem Austausch: das eigene SDP-Angebot per POST
 * hinschicken, die Antwort als SDP zurueckbekommen, fertig. Kein SDK, keine
 * Signalisierung ueber WebSocket.
 *
 * Bewusst ohne Trickle-ICE: erst alle Kandidaten sammeln, dann senden. Das
 * kostet rund eine Sekunde beim Start und spart den ganzen PATCH-Weg samt
 * seiner Sonderfaelle. Fuer einen Livestream, der ohnehin ein paar Sekunden
 * braucht, ist das der bessere Tausch.
 */

/** Wartet, bis der Browser alle ICE-Kandidaten gesammelt hat (mit Deckel). */
export function waitForIce(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    // Ein Kandidat, der spaet kommt, ist besser als ein Start, der nie kommt.
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export class WhipError extends Error {
  constructor(readonly status: number) {
    super(`WHIP ${status}`);
    this.name = "WhipError";
  }
}

/**
 * Tauscht das SDP-Angebot gegen die Antwort der Gegenstelle.
 * Gibt zusaetzlich die Resource-Adresse zurueck (Location-Kopfzeile), an die
 * spaeter ein DELETE geht, um sauber abzumelden.
 */
export async function exchangeSdp(
  url: string,
  offer: string,
  signal?: AbortSignal,
): Promise<{ answer: string; resource: string | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: offer,
    signal,
  });
  if (!res.ok) throw new WhipError(res.status);
  const answer = await res.text();
  const location = res.headers.get("Location");
  const resource = location ? new URL(location, url).toString() : null;
  return { answer, resource };
}

/** Meldet die Sitzung bei der Gegenstelle ab. Fehler sind hier folgenlos. */
export function releaseResource(resource: string | null): void {
  if (!resource) return;
  void fetch(resource, { method: "DELETE", keepalive: true }).catch(() => undefined);
}
