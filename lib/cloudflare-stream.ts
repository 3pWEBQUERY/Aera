import "server-only";
import { env, features } from "./env";

/**
 * Cloudflare Stream Live — Anbindung fuer Streams, die ueber Aera laufen.
 *
 * Der Creator sendet per RTMPS an einen "Live Input", Cloudflare transkodiert
 * und liefert aus. Wir halten pro Live-Session genau einen Input; seine UID
 * steht in `LiveSession.cfInputId`, alles andere (Ingest-Adresse, Schluessel,
 * Verbindungszustand, Aufzeichnungen) wird bei Bedarf abgefragt.
 *
 * Der Stream-Schluessel wird bewusst NICHT gespeichert. Er erlaubt jedem, der
 * ihn hat, unter fremdem Namen zu senden; in der Datenbank waere er ein
 * Geheimnis mehr, das man schuetzen, rotieren und beim Export ausnehmen muss.
 * Cloudflare gibt ihn auf Anfrage heraus — das genuegt.
 */

const API = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 12_000;

/** Wie lange ein Wiedergabe-Token gilt. Kurz genug, dass Weitergabe nichts bringt. */
const TOKEN_TTL_SECONDS = 2 * 60 * 60;

export interface LiveInput {
  uid: string;
  /** rtmps://live.cloudflare.com:443/live/ */
  ingestUrl: string;
  /** Der geheime Sendeschluessel. Nur an Staff ausgeben. */
  streamKey: string;
  srtUrl: string | null;
  srtPassphrase: string | null;
  /** true, sobald eine Sendesoftware verbunden ist. */
  connected: boolean;
}

export interface LiveRecording {
  uid: string;
  hlsUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

export class CloudflareStreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CloudflareStreamError";
  }
}

/** Ist die Plattform fuer eigene Streams eingerichtet? */
export function streamLiveEnabled(): boolean {
  return features.streamLive;
}

interface CfEnvelope<T> {
  success: boolean;
  result: T;
  errors?: { code?: number; message?: string }[];
}

/**
 * Ein Aufruf gegen die Cloudflare-API. Fehler werden zu einer Meldung ohne
 * Token verdichtet — die Antwort landet sonst ueber Logs und Fehlerseiten an
 * Stellen, an denen ein API-Schluessel nichts zu suchen hat.
 */
async function cf<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  if (!streamLiveEnabled()) {
    throw new CloudflareStreamError(0, "streamNotConfigured");
  }
  let res: Response;
  try {
    res = await fetch(`${API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_STREAM_TOKEN}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // Zeitueberschreitung oder Netzfehler — fuer den Aufrufer dasselbe wie ein
    // 5xx, nur ohne Antwortkoerper.
    throw new CloudflareStreamError(504, "streamUnreachable");
  }

  const json = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
  if (!res.ok || !json?.success) {
    const detail = json?.errors?.map((e) => e.message).filter(Boolean).join("; ");
    throw new CloudflareStreamError(res.status, detail || `Cloudflare ${res.status}`);
  }
  return json.result;
}

interface RawInput {
  uid: string;
  rtmps?: { url?: string; streamKey?: string };
  srt?: { url?: string; passphrase?: string };
  status?: { current?: { state?: string } } | null;
}

function toLiveInput(raw: RawInput): LiveInput {
  return {
    uid: raw.uid,
    ingestUrl: raw.rtmps?.url ?? "",
    streamKey: raw.rtmps?.streamKey ?? "",
    srtUrl: raw.srt?.url ?? null,
    srtPassphrase: raw.srt?.passphrase ?? null,
    connected: raw.status?.current?.state === "connected",
  };
}

/**
 * Legt einen Live Input an.
 *
 * `requireSignedURLs` haengt daran, ob die Session Rechte voraussetzt: ein
 * offener Stream soll sich einbetten und teilen lassen, ein bezahlter darf
 * genau das nicht. Aufgezeichnet wird immer — die Wiederholung ist der halbe
 * Wert eines Livestreams, und loeschen kann der Creator sie hinterher.
 */
export async function createLiveInput(input: {
  name: string;
  requireSignedURLs: boolean;
  deleteRecordingAfterDays?: number;
}): Promise<LiveInput> {
  const raw = await cf<RawInput>("/live_inputs", {
    method: "POST",
    body: {
      meta: { name: input.name.slice(0, 120) },
      recording: {
        mode: "automatic",
        requireSignedURLs: input.requireSignedURLs,
        ...(input.deleteRecordingAfterDays
          ? { timeoutSeconds: 0, deleteRecordingAfterDays: input.deleteRecordingAfterDays }
          : {}),
      },
    },
  });
  return toLiveInput(raw);
}

/** Zugangsdaten und Verbindungszustand eines Inputs. */
export async function getLiveInput(uid: string): Promise<LiveInput | null> {
  try {
    return toLiveInput(await cf<RawInput>(`/live_inputs/${encodeURIComponent(uid)}`));
  } catch (error) {
    // Ein geloeschter Input ist kein Fehler, sondern eine Antwort.
    if (error instanceof CloudflareStreamError && error.status === 404) return null;
    throw error;
  }
}

export async function deleteLiveInput(uid: string): Promise<void> {
  try {
    await cf(`/live_inputs/${encodeURIComponent(uid)}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof CloudflareStreamError && error.status === 404) return;
    throw error;
  }
}

interface RawVideo {
  uid: string;
  status?: { state?: string };
  playback?: { hls?: string };
  thumbnail?: string;
  duration?: number;
  created?: string;
}

/**
 * Die juengste fertige Aufzeichnung eines Inputs.
 *
 * Cloudflare braucht nach dem Sendeende einen Moment, bis der Zustand auf
 * "ready" springt. Der Aufrufer bekommt darum `null` statt eines Fehlers und
 * kann es spaeter erneut versuchen.
 */
export async function latestRecording(uid: string): Promise<LiveRecording | null> {
  const videos = await cf<RawVideo[]>(`/live_inputs/${encodeURIComponent(uid)}/videos`);
  const ready = videos
    .filter((v) => v.status?.state === "ready")
    .sort((a, b) => String(b.created ?? "").localeCompare(String(a.created ?? "")));
  const v = ready[0];
  if (!v) return null;
  return {
    uid: v.uid,
    hlsUrl: v.playback?.hls ?? null,
    thumbnailUrl: v.thumbnail ?? null,
    durationSeconds: typeof v.duration === "number" ? Math.round(v.duration) : null,
  };
}

/**
 * Kurzlebiges Wiedergabe-Token fuer einen geschuetzten Stream.
 *
 * Wird anstelle der UID in die Wiedergabe-Adresse gesetzt. Cloudflare stellt
 * es aus, wir muessen also keinen Signaturschluessel halten.
 */
export async function playbackToken(uid: string): Promise<string> {
  const result = await cf<{ token: string }>(`/${encodeURIComponent(uid)}/token`, {
    method: "POST",
    body: { exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS },
  });
  return result.token;
}

/** Wiedergabe-Adresse (Player im iframe). `idOrToken` ist die UID oder ein Token. */
export function streamIframeUrl(idOrToken: string): string {
  return `https://customer-${env.CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${idOrToken}/iframe`;
}

/** HLS-Adresse — fuer eigene Player und fuer die iOS-App. */
export function streamHlsUrl(idOrToken: string): string {
  return `https://customer-${env.CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${idOrToken}/manifest/video.m3u8`;
}
