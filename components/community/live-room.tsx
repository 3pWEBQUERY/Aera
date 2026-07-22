"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { timeAgo } from "@/lib/utils";
import { toLiveEmbedUrl } from "@/lib/live-embed";
import { LiveCountdown } from "./live-countdown";

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
  startsAt,
  initialMessages,
  canChat,
}: {
  slug: string;
  sessionId: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  streamUrl: string | null;
  replayUrl: string | null;
  startsAt?: string | null;
  initialMessages: LiveMessage[];
  canChat: boolean;
}) {
  const t = useTranslations("community.render.live");
  const locale = useLocale();
  const [messages, setMessages] = useState<LiveMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set(initialMessages.map((m) => m.id)));

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

  function enterFullscreen() {
    playerBoxRef.current?.requestFullscreen?.().catch(() => undefined);
  }

  const rawPlayerUrl = status === "ENDED" ? replayUrl : streamUrl ?? replayUrl;
  // Host erst nach dem Mount lesen (hydration-sicher); Twitch braucht ihn als
  // parent-Parameter. Kanal-/Video-Links werden in Player-Embeds umgewandelt.
  const [embedHost, setEmbedHost] = useState<string | null>(null);
  useEffect(() => setEmbedHost(window.location.hostname), []);
  const playerUrl = rawPlayerUrl
    ? toLiveEmbedUrl(rawPlayerUrl, embedHost ?? undefined)
    : rawPlayerUrl;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // Realtime via SSE with a polling fallback.
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
    const base = `/api/c/${slug}/live/${sessionId}`;
    let poll: ReturnType<typeof setInterval> | null = null;
    const lastIso = () => messages[messages.length - 1]?.createdAt ?? new Date(0).toISOString();

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
    <div
      style={{ ["--chat-w" as string]: `${chatWidth}px` }}
      className="flex flex-col gap-5 lg:flex-row lg:items-start"
    >
      <div className="min-w-0 flex-1">
        {/* Steuerleiste: Vollbild + Chat ein-/ausblenden */}
        <div className="mb-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={enterFullscreen}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#161613]/60 transition hover:bg-[#161613]/5 hover:text-[#161613]"
          >
            <Icon name="expand" size={14} /> {t("fullscreen")}
          </button>
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
          {playerUrl ? (
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
                <LiveCountdown
                  startsAt={startsAt}
                  className="mt-1 text-2xl font-semibold text-white"
                />
              )}
            </div>
          )}
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
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#161613] text-white transition hover:bg-[#33332e] disabled:opacity-40"
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
