"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";
import { exchangeSdp, releaseResource, waitForIce } from "@/lib/whip";

/**
 * Zuschauer-Player fuer einen Stream, der aus dem Browser gesendet wird.
 *
 * WebRTC statt HLS: unter einer Sekunde Verzoegerung, dafuer keine
 * Qualitaetsstufen und kein Zurueckspulen. Fuer ein Gespraech mit dem Chat ist
 * das der richtige Tausch — man reagiert auf Fragen, waehrend sie gestellt
 * werden, nicht zwanzig Sekunden spaeter.
 */
export function WhepPlayer({ url }: { url: string }) {
  const t = useTranslations("community.render.live");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"connecting" | "playing" | "failed">("connecting");
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    });
    const abort = new AbortController();
    let resource: string | null = null;
    let stopped = false;

    const stream = new MediaStream();
    pc.addEventListener("track", (event) => {
      stream.addTrack(event.track);
      if (videoRef.current) videoRef.current.srcObject = stream;
    });
    pc.addEventListener("connectionstatechange", () => {
      if (stopped) return;
      if (pc.connectionState === "connected") setState("playing");
      if (pc.connectionState === "failed") setState("failed");
    });

    (async () => {
      try {
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
        await pc.setLocalDescription(await pc.createOffer());
        await waitForIce(pc);
        const { answer, resource: res } = await exchangeSdp(
          url,
          pc.localDescription!.sdp,
          abort.signal,
        );
        if (stopped) return;
        resource = res;
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
      } catch {
        if (!stopped) setState("failed");
      }
    })();

    return () => {
      stopped = true;
      abort.abort();
      releaseResource(resource);
      pc.close();
    };
  }, [url]);

  return (
    <div className="absolute inset-0">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="h-full w-full bg-black object-contain"
      />

      {state !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white/75">
          <Icon name={state === "failed" ? "alert" : "broadcast"} size={30} />
          <span className="text-sm">{state === "failed" ? t("whepFailed") : t("whepConnecting")}</span>
        </div>
      )}

      {/* Autoplay laeuft nur stumm an. Der Knopf holt den Ton, sobald jemand
          ihn will — ohne ihn bliebe der Stream unbemerkt tonlos. */}
      {state === "playing" && muted && (
        <button
          type="button"
          onClick={() => setMuted(false)}
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-[#161613] shadow-lg transition hover:bg-white"
        >
          <Icon name="volume" size={16} />
          {t("unmute")}
        </button>
      )}
    </div>
  );
}
