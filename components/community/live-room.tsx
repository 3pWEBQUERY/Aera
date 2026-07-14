"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { timeAgo } from "@/lib/utils";

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
  initialMessages,
  canChat,
}: {
  slug: string;
  sessionId: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  streamUrl: string | null;
  replayUrl: string | null;
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

  const playerUrl = status === "ENDED" ? replayUrl : streamUrl ?? replayUrl;

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
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="relative overflow-hidden rounded-2xl border border-[#161613]/10 bg-black" style={{ aspectRatio: "16 / 9" }}>
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
            </div>
          )}
        </div>
      </div>

      <aside className="flex h-[70vh] min-h-0 flex-col rounded-2xl border border-[#161613]/10 bg-white">
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
