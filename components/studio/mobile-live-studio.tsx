"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { exchangeSdp, releaseResource, waitForIce } from "@/lib/whip";
import { Icon } from "@/components/dashboard/icons";

/**
 * Studio-Buehne fuer die iOS-App.
 *
 * Bild und Ton kommen aus dem Geraet und gehen per WHIP direkt an Cloudflare —
 * derselbe Handgriff wie im Browser-Studio des Dashboards. Was hier fehlt, ist
 * alles, was die App besser selbst macht: Kopfzeile, Chat, Zurueck.
 *
 * Die Verstaendigung mit der App laeuft in beide Richtungen:
 * - hinein: `window.__aeraStudio = { token, slug }` vor dem Laden gesetzt,
 * - hinaus: `webkit.messageHandlers.aeraStudio.postMessage({ type … })`,
 * - zurueck: `window.aeraStudioEnd()` beendet die Sendung von aussen.
 */

type Phase = "idle" | "starting" | "live" | "error";

interface StudioBridge {
  token?: string;
  slug?: string;
}

declare global {
  interface Window {
    __aeraStudio?: StudioBridge;
    aeraStudioEnd?: () => void;
    webkit?: {
      messageHandlers?: Record<string, { postMessage: (body: unknown) => void }>;
    };
  }
}

/** Nachricht an die App. Fehlt die Bruecke (Browser-Test), passiert nichts. */
function notifyApp(body: Record<string, unknown>): void {
  try {
    window.webkit?.messageHandlers?.aeraStudio?.postMessage(body);
  } catch {
    // Kein WebView — dann gibt es auch niemanden, der zuhoert.
  }
}

export function MobileLiveStudio({ sessionId }: { sessionId: string }) {
  const t = useTranslations("dashboard.live.mobileStudio");

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resourceRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>();
  const [micOn, setMicOn] = useState(true);
  const [front, setFront] = useState(true);
  const [seconds, setSeconds] = useState(0);

  const bridge = (): StudioBridge => window.__aeraStudio ?? {};

  const api = useCallback(
    async (path: string, init?: { method?: string; body?: unknown }): Promise<unknown> => {
      const { token, slug } = bridge();
      if (!token || !slug) throw new Error("bridge");
      const res = await fetch(`/api/mobile/v1/studio/${encodeURIComponent(slug)}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
        cache: "no-store",
      });
      // jsonOk liefert die Daten direkt, jsonError ein { error }-Objekt.
      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      return json;
    },
    [],
  );

  // ---------------------------------------------------------------- Vorschau

  const openCamera = useCallback(async (useFront: boolean, withAudio = true) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: useFront ? "user" : "environment", width: { ideal: 1280 } },
      // Beim Kamerawechsel bleibt die laufende Tonspur, wo sie ist: sie wird
      // gerade gesendet, und ein neuer Anlauf wuerde die Zuschauer stumm
      // schalten.
      audio: withAudio ? { echoCancellation: true, noiseSuppression: true } : false,
    });
    const previous = streamRef.current;
    if (!withAudio) {
      // Den bestehenden Ton in den neuen Stream uebernehmen.
      previous?.getAudioTracks().forEach((track) => stream.addTrack(track));
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => undefined);
    }
    // Die alten Spuren erst danach stoppen: waere die Kamera zwischendurch
    // frei, zeigte die Vorschau ein schwarzes Loch. Behaltene Tonspuren
    // bleiben ausgenommen.
    previous
      ?.getTracks()
      .filter((track) => !stream.getTracks().includes(track))
      .forEach((track) => track.stop());
    return stream;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await openCamera(true);
        if (!cancelled) notifyApp({ type: "ready" });
      } catch {
        if (cancelled) return;
        setPhase("error");
        setError(t("cameraDenied"));
        notifyApp({ type: "error", reason: "camera" });
      }
    })();
    return () => {
      cancelled = true;
      pcRef.current?.close();
      pcRef.current = null;
      releaseResource(resourceRef.current);
      resourceRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // openCamera ist stabil; t nur fuer die Meldung.
  }, [openCamera, t]);

  // Sendedauer — dieselbe Uhr, die die App in ihrer Kopfzeile zeigt.
  useEffect(() => {
    if (phase !== "live") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    notifyApp({ type: "phase", phase, seconds });
    // Nur beim Wechsel melden, nicht im Sekundentakt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------------------------------------------------------------- Senden

  const stop = useCallback(
    async (markEnded: boolean) => {
      pcRef.current?.close();
      pcRef.current = null;
      releaseResource(resourceRef.current);
      resourceRef.current = null;
      setPhase("idle");
      setSeconds(0);
      if (markEnded) {
        try {
          await api(`/live/${encodeURIComponent(sessionId)}`, {
            method: "PATCH",
            body: { status: "ENDED" },
          });
        } catch {
          // Der Zustand laesst sich auch im Dashboard richtigstellen; die
          // Sendung ist in jedem Fall beendet.
        }
      }
      notifyApp({ type: "ended" });
    },
    [api, sessionId],
  );

  const start = useCallback(async () => {
    if (phase === "starting" || phase === "live") return;
    setPhase("starting");
    setError(undefined);
    try {
      const info = (await api(`/live/${encodeURIComponent(sessionId)}`)) as {
        whipUrl?: string | null;
      };
      const whipUrl = info?.whipUrl;
      if (!whipUrl) throw new Error(t("noIngest"));

      const stream = streamRef.current ?? (await openCamera(front));
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);

      const { answer, resource } = await exchangeSdp(whipUrl, pc.localDescription?.sdp ?? "");
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      resourceRef.current = resource;

      await api(`/live/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        body: { status: "LIVE" },
      });
      setPhase("live");
      setSeconds(0);
      notifyApp({ type: "live" });
    } catch (cause) {
      pcRef.current?.close();
      pcRef.current = null;
      setPhase("error");
      setError(cause instanceof Error ? cause.message : t("startFailed"));
      notifyApp({ type: "error", reason: "start" });
    }
  }, [api, front, openCamera, phase, sessionId, t]);

  // Die App beendet von aussen — ihr „Beenden" liegt in der nativen Kopfzeile.
  useEffect(() => {
    window.aeraStudioEnd = () => {
      void stop(true);
    };
    return () => {
      delete window.aeraStudioEnd;
    };
  }, [stop]);

  // Beim Schliessen der Seite sauber abmelden, sonst haelt Cloudflare den
  // Eingang noch fuer eine Weile offen.
  useEffect(() => {
    const bye = () => {
      releaseResource(resourceRef.current);
      resourceRef.current = null;
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []);

  // ---------------------------------------------------------------- Steuerung

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
  }

  async function flipCamera() {
    const next = !front;
    setFront(next);
    try {
      const live = Boolean(pcRef.current);
      const stream = await openCamera(next, !live);
      // Im Livebetrieb die gesendete Spur austauschen, nicht neu verbinden.
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
      const track = stream.getVideoTracks()[0];
      if (sender && track) await sender.replaceTrack(track);
      // Eine neu geoeffnete Tonspur startet immer laut — die Stummschaltung
      // gilt weiter.
      stream.getAudioTracks().forEach((audio) => {
        audio.enabled = micOn;
      });
    } catch {
      setFront(!next);
    }
  }

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={`h-full w-full object-cover ${front ? "-scale-x-100" : ""}`}
        />

        {phase === "live" && (
          <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {t("onAir")} · <span className="tabular-nums">{clock}</span>
          </span>
        )}

        {error && (
          <div className="absolute inset-x-4 top-16 rounded-xl bg-black/70 p-3 text-sm">
            {error}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-4 px-5 pb-8 pt-4">
        <button
          type="button"
          onClick={toggleMic}
          aria-label={micOn ? t("micOff") : t("micOn")}
          className={`flex h-12 w-12 items-center justify-center rounded-full border text-lg ${
            micOn ? "border-white/25 bg-white/10" : "border-white bg-white text-black"
          }`}
        >
          <Icon name={micOn ? "mic" : "micOff"} size={19} />
        </button>

        {phase === "live" ? (
          <button
            type="button"
            onClick={() => void stop(true)}
            className="rounded-full bg-red-600 px-8 py-3.5 text-base font-semibold"
          >
            {t("end")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            disabled={phase === "starting"}
            className="rounded-full bg-white px-8 py-3.5 text-base font-semibold text-black disabled:opacity-60"
          >
            {phase === "starting" ? t("starting") : t("goLive")}
          </button>
        )}

        <button
          type="button"
          onClick={() => void flipCamera()}
          aria-label={t("flip")}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 text-lg"
        >
          <Icon name="flip" size={19} />
        </button>
      </div>
    </div>
  );
}
