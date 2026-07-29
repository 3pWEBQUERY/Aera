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
          "absolute inset-0 flex flex-col bg-white transition-transform duration-300 ease-out will-change-transform",
          shown ? "translate-y-0" : "translate-y-full",
        )}
      >
        {/* ---- Kopf ---- */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--action)] text-[var(--action-fg)]">
              <Icon name="broadcast" size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-400">{t("studioTitle")}</p>
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
                  ? "bg-[var(--action-soft)] text-slate-800"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
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
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
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
              className="relative min-h-0 flex-1 bg-slate-950"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-contain"
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
            <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3.5 sm:px-5">
              <FormError message={error} />
              <div className={cn("flex flex-wrap items-center gap-2.5", error && "mt-3")}>
                {!live && (
                  <>
                    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
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
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-800",
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
                        className="max-w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                      >
                        {cams.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || t("browserDeviceFallback", { n: i + 1 })}
                          </option>
                        ))}
                      </select>
                    )}

                    {mics.length > 1 && (
                      <select
                        aria-label={t("browserMicLabel")}
                        value={micId}
                        onChange={(e) => setMicId(e.target.value)}
                        className="max-w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
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

                <p className="mr-auto hidden max-w-sm text-xs leading-relaxed text-slate-400 xl:block">
                  {t("browserHint")}
                </p>
                <span className="flex-1 xl:hidden" />

                <button
                  type="button"
                  onClick={() => setMicOn((v) => !v)}
                  aria-pressed={!micOn}
                  title={micOn ? t("browserMute") : t("browserUnmute")}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition",
                    micOn
                      ? "border-slate-200 text-slate-600 hover:bg-slate-50"
                      : "border-red-200 bg-red-50 text-red-600",
                  )}
                >
                  <Icon name={micOn ? "mic" : "micOff"} size={17} />
                </button>

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
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.98] disabled:opacity-50"
                  >
                    <Icon name="broadcast" size={17} />
                    {phase === "starting" ? t("browserStarting") : t("goLive")}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ---- Chat: Spalte auf grossen Flaechen, Blatt auf kleinen ---- */}
          <aside
            className={cn(
              "min-h-0 flex-col border-l border-slate-200 bg-white",
              chatOpen ? "hidden w-[340px] shrink-0 lg:flex xl:w-[380px]" : "hidden",
            )}
          >
            <StudioChat slug={slug} sessionId={sessionId} />
          </aside>
          {chatOpen && (
            <div className="absolute inset-0 z-20 lg:hidden">
              <div
                className="absolute inset-0 bg-slate-900/40"
                onClick={() => setChatOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 top-1/4 flex flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-12px_40px_rgba(15,15,13,0.25)]">
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2">
                  <span className="mx-auto h-1 w-9 rounded-full bg-slate-300" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    aria-label={tUi("close")}
                    className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // Erst die letzten Nachrichten holen, dann live per SSE anschliessen;
  // bricht der Stream weg, springt das Polling aus dem Live-Room-Muster ein.
  useEffect(() => {
    let stopped = false;
    const add = (incoming: LiveMessage[]) => {
      if (stopped || incoming.length === 0) return;
      setMessages((prev) => {
        const next = [...prev];
        for (const m of incoming) {
          if (!seen.current.has(m.id)) {
            seen.current.add(m.id);
            next.push(m);
          }
        }
        return next;
      });
    };
    const lastIso = () =>
      seen.current.size === 0
        ? new Date(0).toISOString()
        : (messages[messages.length - 1]?.createdAt ?? new Date(0).toISOString());

    void (async () => {
      try {
        const res = await fetch(`/api/c/${slug}/live/${sessionId}`);
        if (res.ok) {
          const data = (await res.json()) as { messages: LiveMessage[] };
          add(data.messages);
        }
      } catch {
        /* SSE/Polling unten faengt auf */
      }
    })();

    const base = `/api/c/${slug}/live/${sessionId}`;
    let poll: ReturnType<typeof setInterval> | null = null;
    const es = new EventSource(`${base}/stream`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { message?: LiveMessage };
        if (data.message) add([data.message]);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      if (poll) return;
      poll = setInterval(async () => {
        try {
          const res = await fetch(`${base}?after=${encodeURIComponent(lastIso())}`);
          if (res.ok) {
            const data = (await res.json()) as { messages: LiveMessage[] };
            add(data.messages);
          }
        } catch {
          /* ignore */
        }
      }, 4000);
    };
    return () => {
      stopped = true;
      es.close();
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, sessionId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      await fetch(`/api/c/${slug}/live/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!hideTitle && (
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{t("studioChatTitle")}</p>
          {messages.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {messages.length}
            </span>
          )}
        </div>
      )}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400">{t("studioChatEmpty")}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex gap-2.5">
              <Avatar name={m.user.name} src={m.user.avatarUrl} size={28} />
              <div className="min-w-0">
                <p className="text-xs text-slate-400">
                  <span className="font-medium text-slate-700">{m.user.name}</span> ·{" "}
                  {timeAgo(new Date(m.createdAt), locale)}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{m.body}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <form
        onSubmit={send}
        className="flex shrink-0 items-center gap-2 border-t border-slate-100 p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("studioChatPlaceholder")}
          maxLength={1000}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--action)] text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] disabled:opacity-40"
          aria-label={t("studioChatSend")}
        >
          <Icon name="send" size={16} />
        </button>
      </form>
    </>
  );
}
