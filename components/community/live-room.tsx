"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { timeAgo } from "@/lib/utils";
import { toLiveEmbedUrl } from "@/lib/live-embed";
import { LiveCountdown } from "./live-countdown";
import { WhepPlayer } from "./whep-player";

interface LiveMessage {
  id: string;
  body: string;
  createdAt: string;
  user: { name: string; avatarUrl: string | null };
}

export function LiveRoom({
  slug,
  sessionId,
  status,
  streamUrl,
  replayUrl,
  embedUrl,
  whepUrl,
  startsAt,
  initialMessages,
  canChat,
}: {
  slug: string;
  sessionId: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  streamUrl: string | null;
  replayUrl: string | null;
  /**
   * Fertige Wiedergabe-Adresse fuer Streams, die ueber Aera laufen. Sie wird
   * auf dem Server erzeugt, weil ein geschuetzter Stream ein signiertes Token
   * braucht — das darf im Browser nicht entstehen.
   */
  embedUrl?: string | null;
  /** WHEP-Adresse, wenn gerade aus dem Browser gesendet wird. */
  whepUrl?: string | null;
  startsAt?: string | null;
  initialMessages: LiveMessage[];
  canChat: boolean;
}) {
  const t = useTranslations("community.render.live");
  const locale = useLocale();
  const router = useRouter();

  /**
   * Kino-Modus.
   *
   * Auf dem Telefon ist der Stream nicht ein Kaestchen auf einer Seite,
   * sondern das Einzige, was gerade zaehlt. Er nimmt deshalb den ganzen
   * Bildschirm ein, und der Chat legt sich darueber statt darunter — sonst
   * bleiben fuer Bild und Gespraech jeweils die Haelfte von zu wenig.
   *
   * Ab lg bleibt es beim Nebeneinander: dort ist Platz fuer beides.
   */
  const [theater, setTheater] = useState(false);
  const [landscape, setLandscape] = useState(false);
  useEffect(() => {
    const small = window.matchMedia("(max-width: 1023px)");
    const wide = window.matchMedia("(orientation: landscape)");
    const sync = () => {
      setTheater(small.matches);
      setLandscape(wide.matches);
    };
    sync();
    small.addEventListener("change", sync);
    wide.addEventListener("change", sync);
    return () => {
      small.removeEventListener("change", sync);
      wide.removeEventListener("change", sync);
    };
  }, []);

  // Im Kino-Modus darf die Seite darunter nicht mitscrollen.
  useEffect(() => {
    if (!theater) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [theater]);

  // Im Querformat legt sich der Chat an die rechte Kante, im Hochformat an
  // den unteren Rand. Ein- und ausblendbar ist er in beiden Lagen.
  const [overlayChat, setOverlayChat] = useState(true);
  const [messages, setMessages] = useState<LiveMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set(initialMessages.map((m) => m.id)));
  const lastIso = useRef<string | null>(
    initialMessages.length > 0
      ? initialMessages[initialMessages.length - 1].createdAt
      : null,
  );

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

  // ---- Layout-Steuerung: Chat ein-/ausblenden, Chatbreite ziehen, Vollbild.
  const playerBoxRef = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(340);
  const chatWidthRef = useRef(chatWidth);
  chatWidthRef.current = chatWidth;
  const CHAT_MIN = 260;
  const CHAT_MAX = 520;

  // Gemerkte Einstellungen erst nach dem Mount lesen (hydration-sicher).
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem("aera-live-chat-width"));
      if (w >= CHAT_MIN && w <= CHAT_MAX) setChatWidth(w);
      if (localStorage.getItem("aera-live-chat-open") === "0") setChatOpen(false);
    } catch {
      /* localStorage nicht verfügbar */
    }
  }, []);

  const persistLayout = (open: boolean, width: number) => {
    try {
      localStorage.setItem("aera-live-chat-open", open ? "1" : "0");
      localStorage.setItem("aera-live-chat-width", String(width));
    } catch {
      /* ignore */
    }
  };

  function toggleChat() {
    setChatOpen((v) => {
      persistLayout(!v, chatWidthRef.current);
      return !v;
    });
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = chatWidthRef.current;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(CHAT_MAX, Math.max(CHAT_MIN, startW + (startX - ev.clientX)));
      setChatWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      persistLayout(true, chatWidthRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function resizeByKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === "ArrowLeft" ? 20 : e.key === "ArrowRight" ? -20 : 0;
    if (!delta) return;
    e.preventDefault();
    setChatWidth((w) => {
      const next = Math.min(CHAT_MAX, Math.max(CHAT_MIN, w + delta));
      persistLayout(true, next);
      return next;
    });
  }

  /**
   * Vollbild — soweit der Browser es hergibt.
   *
   * Auf iOS kennt Safari `requestFullscreen` nur fuer `<video>`, nicht fuer
   * beliebige Elemente. Der Knopf tat dort schlicht nichts. Jetzt weicht er
   * auf `webkitEnterFullscreen` des Videos aus — und wo auch das fehlt (etwa
   * beim eingebetteten Player einer fremden Plattform), verschwindet er.
   * Ein Knopf, der nichts tut, ist schlimmer als keiner.
   *
   * Ausserdem ist er jetzt ein Umschalter: er ging bisher nur hinein.
   */
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  const nativeVideo = useCallback(
    () =>
      playerBoxRef.current?.querySelector<
        HTMLVideoElement & { webkitEnterFullscreen?: () => void }
      >("video") ?? null,
    [],
  );

  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    // Der Player haengt sein <video> erst nach dem Verbinden ein; kurz nach
    // dem Mount noch einmal nachsehen, sonst bleibt der Knopf zu Unrecht weg.
    const check = () =>
      setCanFullscreen(
        Boolean(document.fullscreenEnabled) ||
          typeof nativeVideo()?.webkitEnterFullscreen === "function",
      );
    check();
    const timer = setTimeout(check, 1500);
    return () => clearTimeout(timer);
  }, [nativeVideo, whepUrl, embedUrl, streamUrl, replayUrl]);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    const box = playerBoxRef.current;
    if (document.fullscreenEnabled && box?.requestFullscreen) {
      void box.requestFullscreen().catch(() => undefined);
      return;
    }
    // iOS: nur das Videoelement selbst kann in den Vollbildmodus.
    nativeVideo()?.webkitEnterFullscreen?.();
  }

  const rawPlayerUrl = status === "ENDED" ? replayUrl : streamUrl ?? replayUrl;
  // Host erst nach dem Mount lesen (hydration-sicher); Twitch braucht ihn als
  // parent-Parameter. Kanal-/Video-Links werden in Player-Embeds umgewandelt.
  const [embedHost, setEmbedHost] = useState<string | null>(null);
  useEffect(() => setEmbedHost(window.location.hostname), []);
  // Der eigene Stream hat seine Adresse schon fertig; nur fremde Links muessen
  // noch in eine Einbettung uebersetzt werden.
  const playerUrl =
    embedUrl ??
    (rawPlayerUrl ? toLiveEmbedUrl(rawPlayerUrl, embedHost ?? undefined) : rawPlayerUrl);

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
    // Schliesst die Luecke zwischen Server-Render und Client-Mount.
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

  const player = whepUrl ? (
    <WhepPlayer url={whepUrl} />
  ) : playerUrl ? (
    <iframe
      src={playerUrl}
      title={t("player")}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      className="absolute inset-0 h-full w-full"
    />
  ) : (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
      <Icon name="videos" size={30} />
      <span className="text-sm">{status === "SCHEDULED" ? t("notStarted") : t("noStream")}</span>
      {status === "SCHEDULED" && startsAt && (
        <LiveCountdown startsAt={startsAt} className="mt-1 text-2xl font-semibold text-white" />
      )}
    </div>
  );

  // ------------------------------------------------------------ Kino-Modus
  if (theater) {
    return (
      <div className="fixed inset-0 z-50 bg-black text-white">
        <div ref={playerBoxRef} className="absolute inset-0">
          {player}
        </div>

        {/* Verlaeufe statt Balken: die Bedienung liegt auf dem Bild und muss
            lesbar sein, ohne es zuzudecken. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent" />

        <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={t("back")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition active:scale-95"
          >
            <Icon name="chevron" size={20} className="rotate-90" />
          </button>
          {status === "LIVE" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {t("liveNow")}
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setOverlayChat((v) => !v)}
            aria-pressed={overlayChat}
            aria-label={overlayChat ? t("chatHide") : t("chatShow")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition active:scale-95"
          >
            <Icon name={overlayChat ? "eyeOff" : "chat"} size={18} />
          </button>
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={fullscreen}
              aria-label={t("fullscreen")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition active:scale-95"
            >
              <Icon name={fullscreen ? "collapse" : "expand"} size={18} />
            </button>
          )}
        </div>

        {overlayChat && (
          <div
            className={
              landscape
                ? // Querformat: schmale Spalte an der rechten Kante, damit das
                  // Bild in der Mitte frei bleibt.
                  "absolute bottom-0 right-0 top-0 flex w-[min(20rem,42vw)] flex-col justify-end pb-3 pl-6 pr-3 pt-16"
                : "absolute inset-x-0 bottom-0 flex max-h-[52%] flex-col justify-end px-3 pb-3"
            }
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />

            <div
              ref={listRef}
              className="relative min-h-0 flex-1 space-y-2 overflow-y-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {messages.length === 0 ? (
                <p className="text-sm text-white/50">{t("chatEmpty")}</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="flex items-start gap-2">
                    <Avatar name={m.user.name} src={m.user.avatarUrl} size={24} />
                    <p className="min-w-0 flex-1 text-sm leading-snug">
                      <span className="mr-1.5 font-semibold text-white/60">{m.user.name}</span>
                      <span className="break-words text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
                        {m.body}
                      </span>
                    </p>
                  </div>
                ))
              )}
            </div>

            {canChat && (
              <form onSubmit={send} className="relative flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t("chatPlaceholder")}
                  maxLength={1000}
                  className="min-w-0 flex-1 rounded-full border border-white/20 bg-black/45 px-4 py-2.5 text-sm text-white backdrop-blur-sm placeholder:text-white/45 focus:border-white/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  aria-label={t("send")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#161613] transition active:scale-95 disabled:opacity-40"
                >
                  <Icon name="send" size={17} />
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ ["--chat-w" as string]: `${chatWidth}px` }}
      className="flex flex-col gap-5 lg:flex-row lg:items-start"
    >
      <div className="min-w-0 flex-1">
        {/* Steuerleiste: Vollbild + Chat ein-/ausblenden */}
        <div className="mb-2 flex items-center justify-end gap-1.5">
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={fullscreen}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#161613]/60 transition hover:bg-[#161613]/5 hover:text-[#161613]"
            >
              <Icon name={fullscreen ? "collapse" : "expand"} size={14} /> {t("fullscreen")}
            </button>
          )}
          <button
            type="button"
            onClick={toggleChat}
            aria-pressed={chatOpen}
            className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#161613]/60 transition hover:bg-[#161613]/5 hover:text-[#161613] lg:inline-flex"
          >
            <Icon name={chatOpen ? "eyeOff" : "chat"} size={14} />
            {chatOpen ? t("chatHide") : t("chatShow")}
          </button>
        </div>
        <div
          ref={playerBoxRef}
          className="relative overflow-hidden rounded-2xl border border-[#161613]/10 bg-black"
          style={{ aspectRatio: "16 / 9" }}
        >
          {player}
        </div>
      </div>

      {/* Ziehbarer Trenner: Chatbreite stufenlos anpassen (Pfeiltasten möglich) */}
      {chatOpen && (
        <div
          role="separator"
          aria-label={t("resizeChat")}
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={resizeByKey}
          className="group hidden w-2 shrink-0 cursor-col-resize items-center justify-center self-stretch lg:flex"
        >
          <span className="h-16 w-1 rounded-full bg-[#161613]/10 transition group-hover:bg-[#161613]/30 group-focus-visible:bg-[var(--brand)] group-active:bg-[var(--brand)]" />
        </div>
      )}

      <aside
        className={
          chatOpen
            ? "flex h-[70vh] min-h-0 flex-col rounded-2xl border border-[#161613]/10 bg-white lg:w-[var(--chat-w)] lg:shrink-0"
            : "flex h-[70vh] min-h-0 flex-col rounded-2xl border border-[#161613]/10 bg-white lg:hidden"
        }
      >
        <div className="border-b border-[#161613]/10 px-4 py-3 text-sm font-semibold text-[#161613]">
          {t("chatTitle")}
        </div>
        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="text-sm text-[#161613]/50">{t("chatEmpty")}</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="flex gap-2.5">
                <Avatar name={m.user.name} src={m.user.avatarUrl} size={28} />
                <div className="min-w-0">
                  <p className="text-xs text-[#161613]/50">
                    <span className="font-medium text-[#161613]/80">{m.user.name}</span> · {timeAgo(new Date(m.createdAt), locale)}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-[#161613]/85">{m.body}</p>
                </div>
              </div>
            ))
          )}
        </div>
        {canChat && (
          <form onSubmit={send} className="flex items-center gap-2 border-t border-[#161613]/10 p-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("chatPlaceholder")}
              maxLength={1000}
              className="min-w-0 flex-1 rounded-lg border border-[#161613]/15 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--action)] text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] disabled:opacity-40"
              aria-label={t("send")}
            >
              <Icon name="send" size={16} />
            </button>
          </form>
        )}
      </aside>
    </div>
  );
}
