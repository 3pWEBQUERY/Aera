"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { liveIngestAction, setLiveStatusAction } from "@/app/actions/live";
import { exchangeSdp, releaseResource, waitForIce } from "@/lib/whip";
import { Icon } from "./icons";
import { Label } from "@/components/ui/field";
import { FormError } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Phase = "idle" | "starting" | "live" | "error";

/**
 * Live gehen ohne Sendesoftware.
 *
 * Kamera und Mikrofon liegen im Browser; von dort geht das Bild ueber WHIP
 * direkt zu Cloudflare. Zwischen Klick und Zuschauer liegt keine halbe
 * Sekunde — dafuer gibt es keine Aufzeichnung und keine Szenen. Wer beides
 * braucht, nimmt den Weg ueber OBS.
 *
 * Die Vorschau laeuft schon vor dem Senden: niemand geht gern live, ohne
 * vorher gesehen zu haben, was ankommt.
 */
export function BrowserBroadcaster({
  slug,
  sessionId,
  initiallyLive,
}: {
  slug: string;
  sessionId: string;
  initiallyLive: boolean;
}) {
  const t = useTranslations("dashboard.live");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resourceRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>(initiallyLive ? "live" : "idle");
  const [error, setError] = useState<string>();
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState("");
  const [micId, setMicId] = useState("");
  const [screen, setScreen] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [seconds, setSeconds] = useState(0);

  // ---- Vorschau -----------------------------------------------------------
  const attach = useCallback((stream: MediaStream | null) => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, []);

  const openPreview = useCallback(async () => {
    setError(undefined);
    try {
      const stream = screen
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        : await navigator.mediaDevices.getUserMedia({
            video: camId ? { deviceId: { exact: camId } } : { width: 1280, height: 720 },
            audio: micId ? { deviceId: { exact: micId } } : true,
          });
      // Beim Bildschirmteilen liefert der Browser oft keinen Ton — das
      // Mikrofon kommt dann separat dazu, sonst sendet man stumm.
      if (screen && stream.getAudioTracks().length === 0) {
        const voice = await navigator.mediaDevices
          .getUserMedia({ audio: micId ? { deviceId: { exact: micId } } : true })
          .catch(() => null);
        voice?.getAudioTracks().forEach((track) => stream.addTrack(track));
      }
      attach(stream);
      // Geraetenamen gibt der Browser erst nach erteilter Freigabe heraus.
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCams(devices.filter((d) => d.kind === "videoinput"));
      setMics(devices.filter((d) => d.kind === "audioinput"));
    } catch {
      setError(t("permissionDenied"));
    }
  }, [attach, camId, micId, screen, t]);

  useEffect(() => {
    if (phase === "live") return;
    void openPreview();
  }, [openPreview, phase]);

  useEffect(() => {
    const stream = streamRef.current;
    stream?.getAudioTracks().forEach((track) => (track.enabled = micOn));
  }, [micOn]);

  useEffect(() => {
    if (phase !== "live") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Beim Verlassen der Seite alles freigeben — eine Kamera, die weiterleuchtet,
  // ist ein Vertrauensbruch, kein Schoenheitsfehler.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      releaseResource(resourceRef.current);
      pcRef.current?.close();
    };
  }, []);

  // ---- Senden -------------------------------------------------------------
  async function goLive() {
    setPhase("starting");
    setError(undefined);
    try {
      const fd = new FormData();
      fd.set("tenant", slug);
      fd.set("sessionId", sessionId);
      const access = await liveIngestAction(fd);
      if (access.error || !access.info?.whipUrl) {
        setError(access.error ?? t("whipUnavailable"));
        setPhase("error");
        return;
      }

      const stream = streamRef.current;
      if (!stream) {
        setError(t("permissionDenied"));
        setPhase("error");
        return;
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
        bundlePolicy: "max-bundle",
      });
      pcRef.current = pc;
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "failed") {
          setError(t("whipDropped"));
          setPhase("error");
        }
      });

      await pc.setLocalDescription(await pc.createOffer());
      await waitForIce(pc);
      const { answer, resource } = await exchangeSdp(access.info.whipUrl, pc.localDescription!.sdp);
      resourceRef.current = resource;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });

      // Erst senden, dann sichtbar schalten: sonst sehen Mitglieder ein
      // schwarzes Bild, weil noch nichts ankommt.
      const status = new FormData();
      status.set("tenant", slug);
      status.set("sessionId", sessionId);
      status.set("status", "LIVE");
      const result = await setLiveStatusAction(status);
      if (result.error) {
        setError(result.error);
        setPhase("error");
        return;
      }
      setSeconds(0);
      setPhase("live");
      router.refresh();
    } catch {
      setError(t("whipFailed"));
      setPhase("error");
    }
  }

  async function endLive() {
    releaseResource(resourceRef.current);
    resourceRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;

    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("sessionId", sessionId);
    fd.set("status", "ENDED");
    const result = await setLiveStatusAction(fd);
    if (result.error) setError(result.error);
    setPhase("idle");
    router.refresh();
  }

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{t("browserTitle")}</p>
        {phase === "live" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
            {t("browserOnAir", { clock })}
          </span>
        )}
      </div>

      <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16 / 9" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
        />
        {phase === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white/80">
            {t("browserStarting")}
          </div>
        )}
      </div>

      <FormError message={error} />

      {/* Quelle und Ton lassen sich vor dem Start frei waehlen; waehrend der
          Sendung bleibt nur das Mikrofon schaltbar — ein Geraetewechsel wuerde
          die Verbindung neu aufbauen und den Stream unterbrechen. */}
      {phase !== "live" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("browserSource")}</Label>
            <div className="flex gap-2">
              {(
                [
                  { key: false, icon: "camera" as const, label: t("browserCamera") },
                  { key: true, icon: "screen" as const, label: t("browserScreen") },
                ]
              ).map((o) => (
                <button
                  key={String(o.key)}
                  type="button"
                  onClick={() => setScreen(o.key)}
                  aria-pressed={screen === o.key}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition",
                    screen === o.key
                      ? "border-[var(--action-strong)] bg-[var(--action)] text-[var(--action-fg)]"
                      : "border-slate-200 text-slate-600 hover:border-slate-400",
                  )}
                >
                  <Icon name={o.icon} size={15} />
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {!screen && cams.length > 1 && (
            <div>
              <Label htmlFor="bb-cam">{t("browserCameraLabel")}</Label>
              <select
                id="bb-cam"
                value={camId}
                onChange={(e) => setCamId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              >
                {cams.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t("browserDeviceFallback", { n: i + 1 })}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mics.length > 1 && (
            <div>
              <Label htmlFor="bb-mic">{t("browserMicLabel")}</Label>
              <select
                id="bb-mic"
                value={micId}
                onChange={(e) => setMicId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              >
                {mics.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t("browserDeviceFallback", { n: i + 1 })}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMicOn((v) => !v)}
          aria-pressed={!micOn}
          title={micOn ? t("browserMute") : t("browserUnmute")}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl border transition",
            micOn
              ? "border-slate-200 text-slate-600 hover:bg-slate-50"
              : "border-red-200 bg-red-50 text-red-600",
          )}
        >
          <Icon name={micOn ? "mic" : "micOff"} size={17} />
        </button>

        {phase === "live" ? (
          <button
            type="button"
            onClick={endLive}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {t("endLive")}
          </button>
        ) : (
          <button
            type="button"
            onClick={goLive}
            disabled={phase === "starting"}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.98] disabled:opacity-50"
          >
            <Icon name="broadcast" size={17} />
            {phase === "starting" ? t("browserStarting") : t("goLive")}
          </button>
        )}
      </div>

      <p className="text-xs leading-relaxed text-slate-400">{t("browserHint")}</p>
    </div>
  );
}
