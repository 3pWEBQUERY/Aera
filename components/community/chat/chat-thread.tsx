"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

export interface ThreadMessage {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string | null };
}

export type ThreadTarget = { kind: "space" | "dm"; id: string };

function timeLabel(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string, locale: string, today_: string, yesterday: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return today_;
  if (d.toDateString() === y.toDateString()) return yesterday;
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

export function ChatThread({
  slug,
  target,
  title,
  subtitle,
  topic,
  headerAvatarUrl,
  maxLength = 4000,
  meId,
  canWrite,
  readOnlyReason,
  joinHref,
  framed = true,
  initialMessages,
}: {
  slug: string;
  target: ThreadTarget;
  title: string;
  subtitle?: string | null;
  topic?: string | null;
  headerAvatarUrl?: string | null; // set for DMs → shows person avatar
  maxLength?: number;
  meId: string;
  canWrite: boolean;
  readOnlyReason?: string | null;
  joinHref: string;
  framed?: boolean;
  initialMessages: ThreadMessage[];
}) {
  const t = useTranslations("spaces.chat");
  const locale = useLocale();
  const day = useCallback(
    (iso: string) => dayLabel(iso, locale, t("today"), t("yesterday")),
    [locale, t],
  );
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));
  const lastAt = useRef<string>(
    initialMessages.length
      ? initialMessages[initialMessages.length - 1].createdAt
      : new Date(0).toISOString(),
  );

  const param = target.kind === "space" ? "space" : "dm";

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  const merge = useCallback((incoming: ThreadMessage[]) => {
    const fresh = incoming.filter((m) => !seen.current.has(m.id));
    if (fresh.length === 0) return;
    for (const m of fresh) seen.current.add(m.id);
    const newest = fresh[fresh.length - 1].createdAt;
    if (newest > lastAt.current) lastAt.current = newest;
    setMessages((prev) => [...prev, ...fresh]);
  }, []);

  // True, solange der SSE-Stream verbunden ist — dann pausiert das Polling.
  const sseConnected = useRef(false);

  const appendLive = useCallback(
    (incoming: ThreadMessage[]) => {
      const el = scrollRef.current;
      const nearBottom = el
        ? el.scrollHeight - el.scrollTop - el.clientHeight < 120
        : true;
      merge(incoming);
      if (nearBottom) requestAnimationFrame(() => scrollToBottom(true));
    },
    [merge, scrollToBottom],
  );

  // Primär: Server-Sent Events — Nachrichten kommen sofort, ohne Polling-Last.
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource(
      `/api/c/${slug}/chat/stream?${param}=${encodeURIComponent(target.id)}`,
    );
    es.onopen = () => {
      sseConnected.current = true;
    };
    es.onerror = () => {
      // EventSource reconnectet selbst; bis dahin übernimmt das Polling.
      sseConnected.current = false;
    };
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { message?: ThreadMessage };
        if (data.message) appendLive([data.message]);
      } catch {
        /* fehlerhafte Frames ignorieren */
      }
    };
    return () => {
      sseConnected.current = false;
      es.close();
    };
  }, [slug, param, target.id, appendLive]);

  // Fallback: Polling — überspringt Ticks, solange SSE verbunden ist, und
  // fängt verpasste Nachrichten nach Reconnects wieder ein.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (sseConnected.current) return;
      try {
        const res = await fetch(
          `/api/c/${slug}/chat?${param}=${encodeURIComponent(target.id)}&after=${encodeURIComponent(lastAt.current)}`,
          { cache: "no-store" },
        );
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { messages: ThreadMessage[] };
        if (alive && data.messages?.length) appendLive(data.messages);
      } catch {
        /* transient — retried next tick */
      }
    };
    const iv = setInterval(tick, 3500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [slug, param, target.id, appendLive]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setNotice(null);
    setDraft("");
    try {
      const res = await fetch(`/api/c/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [param]: target.id, body }),
      });
      if (res.ok) {
        const data = (await res.json()) as { message: ThreadMessage };
        if (data.message) {
          merge([data.message]);
          requestAnimationFrame(() => scrollToBottom(true));
        }
      } else {
        setDraft(body);
        if (res.status === 429) {
          const d = (await res.json().catch(() => ({}))) as { retryAfter?: number };
          setNotice(
            d.retryAfter
              ? t("slowMode", { seconds: d.retryAfter })
              : t("slowModeGeneric"),
          );
        } else if (res.status === 403) {
          setNotice(t("cantWrite"));
        } else {
          setNotice(t("sendFailed"));
        }
      }
    } catch {
      setDraft(body);
      setNotice(t("networkError"));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-white",
        framed && "overflow-hidden rounded-2xl border border-[#161613]/10",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#161613]/10 px-4 py-3">
        {target.kind === "dm" ? (
          <Avatar name={title} src={headerAvatarUrl ?? null} size={40} />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
            <Icon name="chat" size={20} />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#161613]">{title}</p>
          {subtitle && <p className="truncate text-xs text-[#161613]/60">{subtitle}</p>}
        </div>
      </div>

      {/* Pinned topic (groups) */}
      {topic && topic.trim() && (
        <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5">
          <Icon name="megaphone" size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-amber-900">{topic}</p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#161613]/5 text-[#161613]/50">
              <Icon name="chat" size={22} />
            </span>
            <p className="text-sm font-medium text-[#161613]/80">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-[#161613]/50">
              {canWrite ? t("emptyWrite") : t("emptyJoin")}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const mine = m.user.id === meId;
              const newDay = !prev || day(prev.createdAt) !== day(m.createdAt);
              const grouped =
                !newDay &&
                !!prev &&
                prev.user.id === m.user.id &&
                new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              return (
                <div key={m.id}>
                  {newDay && (
                    <div className="my-4 flex items-center justify-center">
                      <span className="rounded-full bg-[#161613]/5 px-3 py-1 text-xs font-medium text-[#161613]/60">
                        {day(m.createdAt)}
                      </span>
                    </div>
                  )}
                  <div className={cn("flex items-end gap-2", mine ? "flex-row-reverse" : "flex-row")}>
                    <div className="w-8 shrink-0">
                      {!mine && !grouped && (
                        <Avatar name={m.user.name} src={m.user.avatarUrl} size={28} />
                      )}
                    </div>
                    <div className={cn("flex max-w-[76%] flex-col", mine ? "items-end" : "items-start")}>
                      {!mine && !grouped && (
                        <span className="mb-0.5 ml-1 text-xs font-medium text-[#161613]/60">
                          {m.user.name}
                        </span>
                      )}
                      <div
                        className={cn(
                          "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                          mine
                            ? "rounded-br-md bg-[var(--brand)] text-white"
                            : "rounded-bl-md bg-[#161613]/5 text-[#161613]",
                        )}
                      >
                        {m.body}
                      </div>
                      <span className="mt-0.5 px-1 text-[11px] text-[#161613]/50">
                        {timeLabel(m.createdAt, locale)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer / read-only footer */}
      {canWrite ? (
        <div className="border-t border-[#161613]/10 px-3 py-3">
          {notice && (
            <p className="mx-auto mb-2 max-w-2xl px-1 text-xs font-medium text-amber-600">{notice}</p>
          )}
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={maxLength}
              placeholder={t("placeholder")}
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-[#161613]/10 bg-[#161613]/[0.03] px-4 py-2.5 text-sm text-[#161613] outline-none transition focus:border-[var(--brand)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-ring)]"
            />
            <button
              onClick={() => void send()}
              disabled={!draft.trim() || sending}
              aria-label={t("sendAria")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white transition hover:bg-[var(--brand-hover)] disabled:opacity-40"
            >
              <Icon name="send" size={18} />
            </button>
          </div>
        </div>
      ) : readOnlyReason ? (
        <div className="flex items-center gap-2 border-t border-[#161613]/10 px-4 py-3 text-sm text-[#161613]/60">
          <Icon name="lock" size={16} className="shrink-0 text-[#161613]/50" />
          {readOnlyReason}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t border-[#161613]/10 px-4 py-3">
          <p className="text-sm text-[#161613]/60">{t("joinPrompt")}</p>
          <Link
            href={joinHref}
            className="shrink-0 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-hover)]"
          >
            {t("joinCta")}
          </Link>
        </div>
      )}
    </div>
  );
}
