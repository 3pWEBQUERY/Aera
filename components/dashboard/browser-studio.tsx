"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { liveIngestAction, setLiveStatusAction } from "@/app/actions/live";
import { exchangeSdp, releaseResource, waitForIce } from "@/lib/whip";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";
import { Icon } from "./icons";
import { Avatar, FormError } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";

type Phase = "idle" | "starting" | "live" | "error";

interface LiveMessage {
  id: string;
  body: string;
  createdAt: string;
  user: { name: string; avatarUrl: string | null };
}

/**
 * Das Live-Studio: voller Viewport, alles an einem Ort.
 *
 * Links die Buehne — Vorschau, was die Zuschauer sehen, samt kompletter
 * Sende-Steuerung (Bildquelle, Geraete, Ton, Live/Ende). Rechts der
 * Zuschauer-Chat derselben Session, damit der Creator reagieren kann, ohne
 * die Sendung aus den Augen zu lassen.
 *
 * Liegt ueber dem Session-Blatt (z-[70] > z-[60]) und wird wie dieses nach
 * <body> portalt: ein Vorfahre mit transform/backdrop-filter wuerde sonst
 * zum Containing Block fuer position:fixed. Dank isTopmostModal im
 * gemeinsamen Modal-Hook schliesst Escape nur das Studio, nicht das Blatt
 * darunter.
 */
export function BrowserStudio({
  slug,
  sessionId,
  title,
  initiallyLive,
  onClose,
}: {
  slug: string;
  sessionId: string;
  title: string;
  initiallyLive: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.live");
  const tUi = useTranslations("uiMigration.dashboard");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resourceRef = useRef<string | null>(null);

  const [shown, setShown] = useState(false);
  const [phase, setPhase] = useState<Phase>(initiallyLive ? "live" : "idle");
  const [error, setError] = useState<string>();
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState("");
  const [micId, setMicId] = useState("");
  const [screen, setScreen] = useState(false);
  const [micOn, setMicOn] = useState(true);
  // Die Vorschau der eigenen Kamera wird gespiegelt — so kennt man sich aus
  // dem Spiegel. Ein gespiegelter Bildschirm waere dagegen unlesbar, deshalb
  // gilt es nur fuer die Kamera. Gesendet wird ohnehin ungespiegelt.
  const [mirror, setMirror] = useState(true);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  // Auf schmalen Viewports teilen sich Buehne und Chat den Platz nicht —
  // der Chat liegt dann als Blatt ueber der Buehne und startet zu.
  const [chatOpen, setChatOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setChatOpen(false);
  }, []);

  const dialogRef = useModalAccessibility<HTMLDivElement>({
    open: true,
    onClose: () => requestClose(),
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

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

  /**
   * Aussteuerung.
   *
   * Ohne sie merkt man erst nach der Sendung, dass das falsche Mikrofon lief
   * oder der Pegel bei null stand. Der Balken beantwortet die Frage vorher —
   * und waehrend der Sendung, wo sich die Geraete nicht mehr wechseln lassen.
   */
  useEffect(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    let raf = 0;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        // Schnell nach oben, traege nach unten: so liest sich ein Pegel.
        setLevel((prev) => Math.max(peak / 128, prev * 0.86));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Ohne AudioContext bleibt der Balken leer; das Senden haengt nicht daran.
    }
    return () => {
      cancelAnimationFrame(raf);
      void ctx?.close();
    };
  }, [phase, screen, camId, micId]);

  /**
   * Ein geschlossener Tab beendet die Sendung — Bild und Ton kommen aus
   * diesem Fenster. Den Text waehlt der Browser inzwischen selbst, die
   * Rueckfrage kommt trotzdem.
   */
  useEffect(() => {
    if (phase !== "live") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Beim Verlassen alles freigeben — eine Kamera, die weiterleuchtet, ist
  // ein Vertrauensbruch, kein Schoenheitsfehler.
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

  // Schliessen beendet die lokale Uebertragung — auf Sendung lieber einmal
  // zu viel fragen als ein versehentlich abgebrochenes Bild beim Publikum.
  function requestClose() {
    if (phase === "live" && !window.confirm(t("studioCloseConfirm"))) return;
    setShown(false);
    setTimeout(onClose, 280);
  }

  function enterFullscreen() {
    stageRef.current?.requestFullscreen?.().catch(() => undefined);
  }

  const mm = Math.floor(seconds / 60);
  const clock =
    mm >= 60
      ? `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
      : `${String(mm).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const live = phase === "live";

  const studio = (
    <div className="fixed inset-0 z-[70]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("studioTitle")}
        tabIndex={-1}
        className={cn(
          "absolute inset-0 flex flex-col bg-[#0b0b10] text-white transition-transform duration-300 ease-out will-change-transform",
          shown ? "translate-y-0" : "translate-y-full",
        )}
      >
        {/* ---- Kopf ---- */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--action)] text-[var(--action-fg)]">
              <Icon name="broadcast" size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{title}</h2>
              <p className="text-xs text-white/45">{t("studioTitle")}</p>
            </div>
            {live && (
              <span className="ml-1 hidden shrink-0 items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 sm:inline-flex">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
                {t("browserOnAir", { clock })}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setChatOpen((v) => !v)}
              aria-pressed={chatOpen}
              title={chatOpen ? t("studioChatHide") : t("studioChatShow")}
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition",
                chatOpen
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon name="chat" size={17} />
              <span className="hidden sm:inline">
                {chatOpen ? t("studioChatHide") : t("studioChatShow")}
              </span>
            </button>
            <button
              type="button"
              onClick={requestClose}
              aria-label={tUi("close")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </header>

        {/* ---- Buehne + Chat ---- */}
        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={stageRef}
              className="relative min-h-0 flex-1 bg-black"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "absolute inset-0 h-full w-full object-contain",
                  mirror && !screen && "-scale-x-100",
                )}
              />
              {live && !streamRef.current && (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/60">
                  {t("studioNoPreview")}
                </div>
              )}
              {phase === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white/80">
                  {t("browserStarting")}
                </div>
              )}
              {live && (
                <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-lg bg-red-600/90 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm sm:hidden">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  {clock}
                </span>
              )}
              <button
                type="button"
                onClick={enterFullscreen}
                title={t("studioFullscreen")}
                aria-label={t("studioFullscreen")}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80 backdrop-blur-sm transition hover:bg-white/20 hover:text-white"
              >
                <Icon name="expand" size={17} />
              </button>

            </div>

            {/* ---- Steuerung ---- */}
            <div className="shrink-0 bg-[#0b0b10]/85 px-4 py-3.5 backdrop-blur-sm sm:px-5">
              <FormError message={error} />
              <div className={cn("flex flex-wrap items-center gap-2.5", error && "mt-3")}>
                {!live && (
                  <>
                    <div className="flex gap-1 rounded-xl bg-white/10 p-1">
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
                            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                            screen === o.key
                              ? "bg-white text-[#0b0b10]"
                              : "text-white/60 hover:text-white",
                          )}
                        >
                          <Icon name={o.icon} size={15} />
                          {o.label}
                        </button>
                      ))}
                    </div>

                    {!screen && cams.length > 1 && (
                      <select
                        aria-label={t("browserCameraLabel")}
                        value={camId}
                        onChange={(e) => setCamId(e.target.value)}
                        className="max-w-44 rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 text-sm text-white focus:border-white/40 focus:outline-none [&>option]:text-[#161613]"
                      >
                        {cams.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || t("browserDeviceFallback", { n: i + 1 })}
                          </option>
                        ))}
                      </select>
                    )}

                    {!screen && (
                      <button
                        type="button"
                        onClick={() => setMirror((v) => !v)}
                        aria-pressed={mirror}
                        title={t("studioMirror")}
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition",
                          mirror
                            ? "border-white bg-white text-[#0b0b10]"
                            : "border-white/20 text-white/60 hover:bg-white/10",
                        )}
                      >
                        <Icon name="flip" size={17} />
                      </button>
                    )}

                    {mics.length > 1 && (
                      <select
                        aria-label={t("browserMicLabel")}
                        value={micId}
                        onChange={(e) => setMicId(e.target.value)}
                        className="max-w-44 rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 text-sm text-white focus:border-white/40 focus:outline-none [&>option]:text-[#161613]"
                      >
                        {mics.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || t("browserDeviceFallback", { n: i + 1 })}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}

                {/* Der Hinweis lag quer durch die Leiste und nahm den Platz
                    ein, den die Geraetewahl braucht. Als Knopf ist er da, wo
                    man ihn sucht — und nur dann sichtbar, wenn man fragt. */}
                <StudioHint text={t("browserHint")} label={t("studioHintLabel")} />
                <span className="flex-1" />

                <button
                  type="button"
                  onClick={() => setMicOn((v) => !v)}
                  aria-pressed={!micOn}
                  title={micOn ? t("browserMute") : t("browserUnmute")}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition",
                    micOn
                      ? "border-white/20 text-white/80 hover:bg-white/10"
                      : "border-red-500/40 bg-red-600/20 text-red-300",
                  )}
                >
                  <Icon name={micOn ? "mic" : "micOff"} size={17} />
                </button>

                <MicLevel value={micOn ? level : 0} label={t("studioLevel")} />

                {live ? (
                  <button
                    type="button"
                    onClick={endLive}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    {t("endLive")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goLive}
                    disabled={phase === "starting"}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#0b0b10] transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-50"
                  >
                    <Icon name="broadcast" size={17} />
                    {phase === "starting" ? t("browserStarting") : t("goLive")}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ---- Chat: Spalte auf grossen Flaechen, Blatt auf kleinen ---- */}
          {/* ---- Chat: eigene Spalte rechts, Blatt auf kleinen Flaechen ----
              Bild und Gespraech bleiben getrennt. Uebereinandergelegt nimmt
              der Chat dem Bild Flaeche — und im Studio ist die eigene
              Vorschau das Wichtigste. Auf der Zuschauerseite ist es
              umgekehrt; dort liegt der Chat auf dem Bild. */}
          <aside
            className={cn(
              "min-h-0 flex-col border-l border-white/10 bg-[#0b0b10]",
              chatOpen ? "hidden w-[340px] shrink-0 lg:flex xl:w-[380px]" : "hidden",
            )}
          >
            <StudioChat slug={slug} sessionId={sessionId} />
          </aside>

          {chatOpen && (
            <div className="absolute inset-0 z-20 lg:hidden">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setChatOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 top-1/4 flex flex-col rounded-t-2xl border-t border-white/10 bg-[#0b0b10] shadow-[0_-12px_40px_rgba(0,0,0,0.5)]">
                <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2">
                  <span className="mx-auto h-1 w-9 rounded-full bg-white/25" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    aria-label={tUi("close")}
                    className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
                  >
                    <Icon name="close" size={17} />
                  </button>
                </div>
                <StudioChat slug={slug} sessionId={sessionId} hideTitle />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(studio, document.body);
}

/**
 * Der Sendehinweis als Knopf.
 *
 * Aufgeklappt legt er sich ueber die Leiste statt sie auseinanderzuschieben —
 * eine Steuerung, die beim Lesen eines Hinweises ihre Knoepfe verschiebt,
 * waere die schlechtere Antwort auf eine harmlose Frage.
 */
function StudioHint({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl border transition",
          open
            ? "border-white bg-white text-[#0b0b10]"
            : "border-white/20 text-white/60 hover:bg-white/10 hover:text-white",
        )}
      >
        <Icon name="info" size={17} />
      </button>
      {open && (
        <div
          role="note"
          className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-xl border border-white/15 bg-[#16161d] p-3.5 text-xs leading-relaxed text-white/75 shadow-2xl"
        >
          {text}
        </div>
      )}
    </div>
  );
}

/**
 * Aussteuerung als Balkenreihe.
 *
 * Fuenf Balken statt eines Zeigers: man will wissen, ob ueberhaupt etwas
 * ankommt und ob es uebersteuert — nicht den genauen Dezibelwert. Grau heisst
 * still, gruen heisst gut, der letzte Balken faerbt sich bernstein, bevor es
 * klippt.
 */
function MicLevel({ value, label }: { value: number; label: string }) {
  const bars = 5;
  return (
    <span
      className="flex h-10 shrink-0 items-center gap-[3px] rounded-xl border border-white/20 px-2.5"
      title={label}
      aria-label={label}
      role="meter"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: bars }, (_, i) => {
        const on = value * bars > i;
        return (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-all duration-75",
              on ? (i === bars - 1 ? "bg-amber-400" : "bg-emerald-400") : "bg-white/20",
            )}
            style={{ height: `${7 + i * 3}px` }}
          />
        );
      })}
    </span>
  );
}

/**
 * Der Zuschauer-Chat der Session — dieselben Endpunkte wie der oeffentliche
 * Live-Room (SSE mit Polling-Fallback), nur im Dashboard-Gewand. Der Creator
 * schreibt als sich selbst; Staff-Zugriff ist serverseitig abgedeckt.
 */
function StudioChat({
  slug,
  sessionId,
  hideTitle = false,
}: {
  slug: string;
  sessionId: string;
  hideTitle?: boolean;
}) {
  const t = useTranslations("dashboard.live");
  const locale = useLocale();
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  const lastIso = useRef<string | null>(null);

  const addIncoming = useCallback((incoming: LiveMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const next = [...prev];
      for (const m of incoming) {
        if (seen.current.has(m.id)) continue;
        seen.current.add(m.id);
        if (!lastIso.current || m.createdAt > lastIso.current) {
          lastIso.current = m.createdAt;
        }
        next.push(m);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // Realtime: SSE ist der schnelle Pfad, ein deduplizierter Sync alle 4s die
  // Garantie — bleibt der Event-Stream stumm (puffernder Proxy, mehrere
  // Instanzen ohne Redis), kommen Nachrichten trotzdem live an.
  useEffect(() => {
    let stopped = false;
    const base = `/api/c/${slug}/live/${sessionId}`;

    async function sync() {
      try {
        const url = lastIso.current
          ? `${base}?after=${encodeURIComponent(lastIso.current)}`
          : base;
        const res = await fetch(url);
        if (res.ok) {
          const data = (await res.json()) as { messages: LiveMessage[] };
          if (!stopped) addIncoming(data.messages);
        }
      } catch {
        /* naechster Tick versucht es erneut */
      }
    }

    const es = new EventSource(`${base}/stream`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { message?: LiveMessage };
        if (data.message) addIncoming([data.message]);
      } catch {
        /* ignore */
      }
    };
    void sync();
    const poll = setInterval(sync, 4000);
    return () => {
      stopped = true;
      es.close();
      clearInterval(poll);
    };
  }, [slug, sessionId, addIncoming]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/c/${slug}/live/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      // Die eigene Nachricht sofort einblenden — nicht erst warten, bis sie
      // ueber SSE oder den Sync zurueckkommt.
      if (res.ok) {
        const data = (await res.json()) as { message?: LiveMessage };
        if (data.message) addIncoming([data.message]);
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!hideTitle && (
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold text-white">{t("studioChatTitle")}</p>
          {messages.length > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/60">
              {messages.length}
            </span>
          )}
        </div>
      )}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-white/40">{t("studioChatEmpty")}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex gap-2.5">
              <Avatar name={m.user.name} src={m.user.avatarUrl} size={28} />
              <div className="min-w-0">
                <p className="text-xs text-white/40">
                  <span className="font-semibold text-white/70">{m.user.name}</span> ·{" "}
                  {timeAgo(new Date(m.createdAt), locale)}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-white/85 [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">
                  {m.body}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      <form
        onSubmit={send}
        className="flex shrink-0 items-center gap-2 border-t border-white/10 p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("studioChatPlaceholder")}
          maxLength={1000}
          className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#0b0b10] transition hover:bg-white/90 disabled:opacity-40"
          aria-label={t("studioChatSend")}
        >
          <Icon name="send" size={16} />
        </button>
      </form>
    </>
  );
}
