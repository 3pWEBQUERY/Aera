"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Icon, type IconName } from "./icons";
import { cn } from "@/lib/utils";
import { CreditsSheet, type CreditSummary } from "./credits-sheet";
import { MediaPickerSheet, type PickerImage } from "./media-picker-sheet";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";

type AssistantT = ReturnType<typeof useTranslations>;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: string[];
  attachments?: string[]; // image URLs/data URLs shown above the user bubble
}

/** Slash-command state while the user types a `/…` token in a composer. */
interface SlashState {
  mode: Mode;
  start: number;
  query: string;
}

/**
 * Detects a `/…` token ending at the caret. Returns its start index and query
 * (text after the slash) so the composer can show a command menu.
 */
function detectSlash(value: string, caret: number): { start: number; query: string } | null {
  let i = caret - 1;
  while (i >= 0 && !/\s/.test(value[i])) i--;
  const start = i + 1;
  const token = value.slice(start, caret);
  if (!token.startsWith("/")) return null;
  return { start, query: token.slice(1).toLowerCase() };
}
type Mode = "chat" | "image";
type ConversationKind = "CHAT" | "IMAGE";

interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  archived: boolean;
  updatedAt: string;
}

/** A reference image the user attached for the next generation. */
interface Attachment {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
}
/** One entry in the image-mode thread (session-only, not persisted). */
interface ImageMessage {
  id: string;
  role: "user" | "assistant";
  prompt?: string;
  attachments?: string[]; // data URLs (user previews)
  images?: string[]; // result URLs (assistant)
  text?: string;
}

const IMAGE_SUGGESTIONS: { icon: IconName; key: string }[] = [
  { icon: "branding", key: "logo" },
  { icon: "feed", key: "postImage" },
  { icon: "products", key: "mockup" },
  { icon: "members", key: "mascot" },
];

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Fetch a media-library image and turn it into a base64 data URL for attaching. */
async function urlToDataUrl(
  url: string,
): Promise<{ dataUrl: string; mimeType: string; size: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch-failed");
  const blob = await res.blob();
  const dataUrl = await readAsDataURL(blob);
  return { dataUrl, mimeType: blob.type || "image/png", size: blob.size };
}

/** Turn persisted CHAT messages into the UI model (user messages may carry attachments as JSON). */
function parseChatMessages(
  msgs: { id: string; role: "user" | "assistant"; content: string }[],
): Message[] {
  return msgs.map((m) => {
    if (m.role === "user") {
      try {
        const o = JSON.parse(m.content) as { text?: string; attachments?: string[] };
        if (o && typeof o === "object" && Array.isArray(o.attachments)) {
          return { id: m.id, role: "user", content: o.text ?? "", attachments: o.attachments };
        }
      } catch {
        /* plain-text message */
      }
    }
    return { id: m.id, role: m.role, content: m.content };
  });
}

/** Turn persisted IMAGE-conversation messages (JSON content) into the UI model. */
function parseImageMessages(
  msgs: { id: string; role: "user" | "assistant"; content: string }[],
): ImageMessage[] {
  return msgs.map((m) => {
    try {
      const o = JSON.parse(m.content) as {
        prompt?: string;
        attachments?: string[];
        images?: string[];
        text?: string;
      };
      if (m.role === "assistant") {
        return { id: m.id, role: "assistant", images: o.images ?? [], text: o.text ?? "" };
      }
      return { id: m.id, role: "user", prompt: o.prompt ?? "", attachments: o.attachments ?? [] };
    } catch {
      return m.role === "assistant"
        ? { id: m.id, role: "assistant", text: m.content }
        : { id: m.id, role: "user", prompt: m.content };
    }
  });
}

const SUGGESTIONS: { icon: IconName; key: string }[] = [
  { icon: "gamification", key: "analysis" },
  { icon: "spaces", key: "createSpace" },
  { icon: "feed", key: "postIdeas" },
  { icon: "tiers", key: "tierDesc" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

function relTime(iso: string, t: AssistantT, locale: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return t("relNow");
  if (min < 60) return t("relMin", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("relHour", { n: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t("relDay", { n: d });
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export function AssistantWorkspace({
  slug,
  geminiOn,
  user,
  initialCreditsOpen = false,
  initialCheckoutError = false,
}: {
  slug: string;
  geminiOn: boolean;
  user: { name: string; avatarUrl: string | null };
  initialCreditsOpen?: boolean;
  initialCheckoutError?: boolean;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const deleteTitleId = useId();
  const deleteDialogRef = useModalAccessibility<HTMLDivElement>({
    open: Boolean(pendingDelete),
    onClose: () => setPendingDelete(null),
  });
  const [creditsOpen, setCreditsOpen] = useState(initialCreditsOpen);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Image mode: persisted per-conversation, mirroring the chat mode.
  const [mode, setMode] = useState<Mode>("chat");
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [imageMessages, setImageMessages] = useState<ImageMessage[]>([]);
  const [imgPrompt, setImgPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imgLoading, setImgLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Slash-command (/media) + media picker, shared by both composers.
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const t = useTranslations("dashboard.assistant");
  const tSug = useTranslations("dashboard.assistant.suggestions");
  const tImgSug = useTranslations("dashboard.assistant.imageSuggestions");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);

  const refreshCredits = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/assistant/credits?slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = (await res.json()) as { summary: CreditSummary };
        setCreditBalance(data.summary.balance);
      }
    } catch {
      /* ignore */
    }
  }, [slug]);
  useEffect(() => {
    void refreshCredits();
  }, [refreshCredits]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);
  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, imageMessages, imgLoading, mode, scrollToBottom]);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/assistant/conversations?slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = (await res.json()) as { conversations: Conversation[] };
        setConversations(data.conversations ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [slug]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const room = MAX_ATTACHMENTS - attachments.length;
      if (room <= 0) return;
      const picked = Array.from(files)
        .filter((f) => f.type.startsWith("image/") && f.size <= MAX_ATTACHMENT_BYTES)
        .slice(0, room);
      const next: Attachment[] = [];
      for (const f of picked) {
        try {
          const dataUrl = await readAsDataURL(f);
          next.push({ id: uid(), name: f.name, dataUrl, mimeType: f.type });
        } catch {
          /* skip unreadable file */
        }
      }
      if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
    },
    [attachments.length],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Add a picked media-library image as a reference attachment (both modes).
  const addLibraryImage = useCallback(
    async (item: PickerImage) => {
      setPickerOpen(false);
      if (attachments.length >= MAX_ATTACHMENTS) return;
      try {
        const { dataUrl, mimeType, size } = await urlToDataUrl(item.url);
        if (!mimeType.startsWith("image/") || size > MAX_ATTACHMENT_BYTES) return;
        setAttachments((prev) =>
          prev.length >= MAX_ATTACHMENTS
            ? prev
            : [...prev, { id: uid(), name: item.name, dataUrl, mimeType }].slice(0, MAX_ATTACHMENTS),
        );
      } catch {
        /* ignore unreadable media */
      }
    },
    [attachments.length],
  );

  // Composer text change with slash-command detection.
  const onComposerChange = useCallback(
    (m: Mode, value: string, caret: number) => {
      if (m === "chat") setInput(value);
      else setImgPrompt(value);
      const d = detectSlash(value, caret);
      setSlash(d && "media".startsWith(d.query) ? { mode: m, start: d.start, query: d.query } : null);
    },
    [],
  );

  // Pick the /media command: strip the slash token and open the picker.
  const chooseSlashMedia = useCallback(() => {
    setSlash((s) => {
      if (s) {
        const token = "/" + s.query;
        const strip = (v: string) => v.slice(0, s.start) + v.slice(s.start + token.length);
        if (s.mode === "chat") setInput(strip);
        else setImgPrompt(strip);
      }
      return null;
    });
    setPickerOpen(true);
  }, []);

  const generateImage = useCallback(async () => {
    const p = imgPrompt.trim();
    if ((!p && attachments.length === 0) || imgLoading || !geminiOn) return;
    const atts = attachments;
    setImageMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", prompt: p, attachments: atts.map((a) => a.dataUrl) },
    ]);
    setImgPrompt("");
    setAttachments([]);
    setImgLoading(true);
    try {
      const res = await fetch("/api/dashboard/assistant/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          conversationId: activeImageId,
          prompt: p,
          images: atts.map((a) => ({
            mimeType: a.mimeType,
            data: a.dataUrl.split(",")[1] ?? "",
          })),
        }),
      });
      if (res.status === 402) {
        setImageMessages((prev) => [...prev, { id: uid(), role: "assistant", text: t("outOfCreditsImage") }]);
      } else {
        const data = (await res.json()) as {
          conversationId?: string;
          images?: { url: string }[];
          text?: string;
          error?: string;
        };
        if (res.ok) {
          if (data.conversationId) setActiveImageId(data.conversationId);
          setImageMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: "assistant",
              images: (data.images ?? []).map((i) => i.url),
              text: data.text,
            },
          ]);
          void refreshList();
          void refreshCredits();
        } else {
          setImageMessages((prev) => [
            ...prev,
            { id: uid(), role: "assistant", text: data.error ?? t("imageProblem") },
          ]);
        }
      }
    } catch {
      setImageMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", text: t("networkError") },
      ]);
    } finally {
      setImgLoading(false);
    }
  }, [imgPrompt, attachments, imgLoading, geminiOn, slug, activeImageId, refreshList, refreshCredits, t]);

  function onImageKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slash?.mode === "image") {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        chooseSlashMedia();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlash(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void generateImage();
    }
  }

  async function openConversation(id: string) {
    try {
      const res = await fetch("/api/dashboard/assistant/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "get", id }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          conversation: {
            kind?: ConversationKind;
            messages: { id: string; role: "user" | "assistant"; content: string }[];
          };
        };
        if (data.conversation.kind === "IMAGE") {
          setMode("image");
          setActiveImageId(id);
          setImageMessages(parseImageMessages(data.conversation.messages ?? []));
        } else {
          setMode("chat");
          setActiveId(id);
          setMessages(parseChatMessages(data.conversation.messages ?? []));
        }
      }
    } catch {
      /* ignore */
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setSlash(null);
  }

  function newImageSession() {
    setActiveImageId(null);
    setImageMessages([]);
    setImgPrompt("");
    setAttachments([]);
  }

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      const atts = attachments;
      if ((!content && atts.length === 0) || loading || !geminiOn) return;
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "user",
          content,
          attachments: atts.length ? atts.map((a) => a.dataUrl) : undefined,
        },
      ]);
      setInput("");
      setAttachments([]);
      setSlash(null);
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            conversationId: activeId,
            message: content,
            images: atts.map((a) => ({
              mimeType: a.mimeType,
              data: a.dataUrl.split(",")[1] ?? "",
            })),
          }),
        });
        const data = (await res.json()) as {
          conversationId?: string;
          reply?: string;
          actions?: string[];
        };
        if (res.ok && data.conversationId) {
          setActiveId(data.conversationId);
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "assistant", content: data.reply ?? "", actions: data.actions },
          ]);
          void refreshList();
          void refreshCredits();
        } else {
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "assistant", content: t("requestProblem") },
          ]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant", content: t("networkError") },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, geminiOn, slug, activeId, attachments, refreshList, refreshCredits, t],
  );

  async function convAction(action: "archive" | "unarchive" | "delete", id: string) {
    try {
      await fetch("/api/dashboard/assistant/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action, id }),
      });
      if (action === "delete") {
        if (id === activeId) newChat();
        if (id === activeImageId) newImageSession();
      }
      if (action === "archive") setShowArchived(true);
      void refreshList();
    } catch {
      /* ignore */
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slash?.mode === "chat") {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        chooseSlashMedia();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlash(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  const kindForMode: ConversationKind = mode === "image" ? "IMAGE" : "CHAT";
  const visible = conversations.filter((c) => c.kind === kindForMode);
  const active = visible.filter((c) => !c.archived);
  const archived = visible.filter((c) => c.archived);
  const activeConvId = mode === "image" ? activeImageId : activeId;
  const empty = messages.length === 0;

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Conversation sidebar — shared by both modes (Chat & Bild) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/60 md:flex">
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-sm font-bold text-slate-900">
            {mode === "image" ? t("imagesTitle") : t("chatsTitle")}
          </span>
          <button
            type="button"
            onClick={() => (mode === "image" ? newImageSession() : newChat())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            <Icon name="plus" size={14} />
            {t("newBtn")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {active.length === 0 && archived.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-400">
              {mode === "image" ? t("emptyImages") : t("emptyChats")}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {active.map((c) => (
                <ConversationRow
                  key={c.id}
                  c={c}
                  active={c.id === activeConvId}
                  t={t}
                  locale={locale}
                  onOpen={() => openConversation(c.id)}
                  onArchive={() => convAction("archive", c.id)}
                  onDelete={() => setPendingDelete(c)}
                />
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <div className="mt-3 border-t border-slate-200 pt-2">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-100"
              >
                {t("archived", { count: archived.length })}
                <Icon name="chevron" size={12} className={cn("transition", showArchived ? "" : "-rotate-90")} />
              </button>
              {showArchived && (
                <ul className="mt-0.5 space-y-0.5">
                  {archived.map((c) => (
                    <ConversationRow
                      key={c.id}
                      c={c}
                      active={c.id === activeConvId}
                      archived
                      t={t}
                      locale={locale}
                      onOpen={() => openConversation(c.id)}
                      onUnarchive={() => convAction("unarchive", c.id)}
                      onDelete={() => setPendingDelete(c)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
              <Icon name="sparkles" size={16} />
            </span>
            <p className="text-sm font-bold text-slate-900">{t("title")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreditsOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              title={t("creditsButtonTitle")}
            >
              <Icon name="bolt" size={15} className="text-[color:var(--brand)]" />
              {creditBalance === null ? t("credits") : t("creditsWithBalance", { count: nf.format(creditBalance) })}
            </button>
            <ModeSwitch
              mode={mode}
              onChange={(m) => {
                setMode(m);
                setSlash(null);
              }}
              t={t}
            />
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {mode === "chat" ? (
            empty ? (
              <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 py-10 text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
                  <Icon name="sparkles" size={26} />
                </span>
                <h2 className="text-xl font-bold text-slate-900">{t("chatEmptyTitle")}</h2>
                <p className="mt-1.5 max-w-md text-sm text-slate-500">
                  {t("chatEmptyDesc")}
                </p>
                <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => void send(tSug(`${s.key}.prompt`))}
                      disabled={!geminiOn}
                      className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm disabled:opacity-50"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-[var(--brand-soft)] group-hover:text-[color:var(--brand)]">
                        <Icon name={s.icon} size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{tSug(`${s.key}.title`)}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{tSug(`${s.key}.prompt`)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
                {messages.map((m) => (
                  <MessageRow key={m.id} message={m} user={user} />
                ))}
                {loading && <TypingRow />}
              </div>
            )
          ) : imageMessages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 py-10 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
                <Icon name="gallery" size={26} />
              </span>
              <h2 className="text-xl font-bold text-slate-900">{t("imageEmptyTitle")}</h2>
              <p className="mt-1.5 max-w-md text-sm text-slate-500">
                {t("imageEmptyDesc")}
              </p>
              <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
                {IMAGE_SUGGESTIONS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setImgPrompt(tImgSug(`${s.key}.prompt`))}
                    disabled={!geminiOn}
                    className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm disabled:opacity-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-[var(--brand-soft)] group-hover:text-[color:var(--brand)]">
                      <Icon name={s.icon} size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{tImgSug(`${s.key}.title`)}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{tImgSug(`${s.key}.prompt`)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
              {imageMessages.map((m) => (
                <ImageMessageRow key={m.id} message={m} user={user} t={t} />
              ))}
              {imgLoading && <GeneratingRow t={t} />}
            </div>
          )}
        </div>

        {mode === "chat" ? (
          <div className="border-t border-slate-100 px-3 py-3">
            {!geminiOn && (
              <p className="mx-auto mb-2 max-w-3xl px-1 text-xs font-medium text-amber-600">
                {t("geminiOff")}
              </p>
            )}
            <div className="relative mx-auto max-w-3xl">
              {slash?.mode === "chat" && (
                <SlashMenu t={t} onPick={chooseSlashMedia} />
              )}
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="group relative h-16 w-16 overflow-hidden rounded-xl ring-1 ring-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        aria-label={t("removeAttachmentAria")}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-white opacity-0 transition group-hover:opacity-100"
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!geminiOn || loading || attachments.length >= MAX_ATTACHMENTS}
                  aria-label={t("addRefAria")}
                  title={attachments.length >= MAX_ATTACHMENTS ? t("maxRefTitle") : t("addRefAria")}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <Icon name="gallery" size={18} />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => onComposerChange("chat", e.target.value, e.target.selectionStart ?? e.target.value.length)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  disabled={!geminiOn || loading}
                  placeholder={t("chatPlaceholder")}
                  className="max-h-44 min-h-[48px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[var(--brand)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-ring)] disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={(!input.trim() && attachments.length === 0) || loading || !geminiOn}
                  aria-label={t("sendAria")}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand)] text-white transition hover:bg-[var(--brand-hover)] disabled:opacity-40"
                >
                  <Icon name="send" size={18} />
                </button>
              </div>
            </div>
            <p className="mx-auto mt-1.5 max-w-3xl px-1 text-[11px] text-slate-400">
              {t("chatHint")}
            </p>
          </div>
        ) : (
          <div className="border-t border-slate-100 px-3 py-3">
            {!geminiOn && (
              <p className="mx-auto mb-2 max-w-3xl px-1 text-xs font-medium text-amber-600">
                {t("geminiOff")}
              </p>
            )}
            <div className="relative mx-auto max-w-3xl">
              {slash?.mode === "image" && (
                <SlashMenu t={t} onPick={chooseSlashMedia} />
              )}
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="group relative h-16 w-16 overflow-hidden rounded-xl ring-1 ring-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        aria-label={t("removeAttachmentAria")}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-white opacity-0 transition group-hover:opacity-100"
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!geminiOn || imgLoading || attachments.length >= MAX_ATTACHMENTS}
                  aria-label={t("addRefAria")}
                  title={attachments.length >= MAX_ATTACHMENTS ? t("maxRefTitle") : t("addRefAria")}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <Icon name="gallery" size={18} />
                </button>
                <textarea
                  value={imgPrompt}
                  onChange={(e) => onComposerChange("image", e.target.value, e.target.selectionStart ?? e.target.value.length)}
                  onKeyDown={onImageKeyDown}
                  rows={1}
                  disabled={!geminiOn || imgLoading}
                  placeholder={t("imgPlaceholder")}
                  className="max-h-44 min-h-[48px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[var(--brand)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-ring)] disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void generateImage()}
                  disabled={(!imgPrompt.trim() && attachments.length === 0) || imgLoading || !geminiOn}
                  aria-label={t("generateAria")}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand)] text-white transition hover:bg-[var(--brand-hover)] disabled:opacity-40"
                >
                  <Icon name="sparkles" size={18} />
                </button>
              </div>
            </div>
            <p className="mx-auto mt-1.5 max-w-3xl px-1 text-[11px] text-slate-400">
              {t("imgHint")}
            </p>
          </div>
        )}
      </div>

      {/* Shared hidden file input (both composers) + media-library picker. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <MediaPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        slug={slug}
        onPick={(item) => void addLibraryImage(item)}
      />

      <CreditsSheet
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        slug={slug}
        onChanged={(s) => setCreditBalance(s.balance)}
        initialCheckoutError={initialCheckoutError}
      />

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setPendingDelete(null)} />
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={deleteTitleId}
            tabIndex={-1}
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <Icon name="trash" size={18} />
              </span>
              <div className="min-w-0">
                <h3 id={deleteTitleId} className="text-base font-bold text-slate-900">
                  {pendingDelete.kind === "IMAGE" ? t("deleteImageTitle") : t("deleteChatTitle")}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {t("deleteDesc", { title: pendingDelete.title })}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = pendingDelete.id;
                  setPendingDelete(null);
                  void convAction("delete", id);
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                {t("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationRow({
  c,
  active,
  archived,
  t,
  locale,
  onOpen,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  c: Conversation;
  active: boolean;
  archived?: boolean;
  t: AssistantT;
  locale: string;
  onOpen: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
}) {
  return (
    <li
      className={cn(
        "group flex items-center gap-1 rounded-lg pl-3 pr-1 transition",
        active ? "bg-white ring-1 ring-slate-200" : "hover:bg-slate-100",
      )}
    >
      <button onClick={onOpen} className="min-w-0 flex-1 py-2 text-left">
        <span className="block truncate text-sm font-medium text-slate-800" title={c.title}>
          {c.title}
        </span>
        <span className="block text-[11px] text-slate-400">{relTime(c.updatedAt, t, locale)}</span>
      </button>
      <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
        {archived ? (
          <button
            type="button"
            title={t("restore")}
            aria-label={t("restore")}
            onClick={(e) => {
              e.stopPropagation();
              onUnarchive?.();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <Icon name="archive" size={14} />
          </button>
        ) : (
          <button
            type="button"
            title={t("archive")}
            aria-label={t("archive")}
            onClick={(e) => {
              e.stopPropagation();
              onArchive?.();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <Icon name="archive" size={14} />
          </button>
        )}
        <button
          type="button"
          title={t("delete")}
          aria-label={t("delete")}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- Markdown (lite)
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) nodes.push(<strong key={key++} className="font-semibold">{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] !== undefined)
      nodes.push(
        <code key={key++} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.8em]">
          {m[4]}
        </code>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function MarkdownLite({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const bullet = /^\s*([*\-•])\s+(.*)$/;
  const ordered = /^\s*(\d+)[.)]\s+(.*)$/;
  const heading = /^\s*(#{1,6})\s+(.*)$/;

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }
    const h = line.match(heading);
    if (h) {
      blocks.push(
        <p key={key++} className="font-semibold text-slate-900">
          {renderInline(h[2])}
        </p>,
      );
      i++;
      continue;
    }
    if (bullet.test(line)) {
      const items: string[] = [];
      while (i < lines.length && bullet.test(lines[i])) {
        items.push(lines[i].match(bullet)![2]);
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-1 pl-5">
          {items.map((it, k) => (
            <li key={k}>{renderInline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (ordered.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ordered.test(lines[i])) {
        items.push(lines[i].match(ordered)![2]);
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal space-y-1 pl-5">
          {items.map((it, k) => (
            <li key={k}>{renderInline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !ordered.test(lines[i]) &&
      !heading.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="leading-relaxed">
        {renderInline(para.join(" "))}
      </p>,
    );
  }
  return <div className="space-y-2.5">{blocks}</div>;
}

function MessageRow({
  message,
  user,
}: {
  message: Message;
  user: { name: string; avatarUrl: string | null };
}) {
  const mine = message.role === "user";
  const initial = (user.name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <div className={cn("flex gap-3", mine ? "flex-row-reverse" : "flex-row")}>
      {mine ? (
        user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-black/5"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white ring-1 ring-black/5">
            {initial}
          </span>
        )
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          <Icon name="sparkles" size={16} />
        </span>
      )}
      <div className={cn("flex max-w-[85%] flex-col gap-1.5", mine ? "items-end" : "items-start")}>
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn("flex flex-wrap gap-2", mine ? "justify-end" : "justify-start")}>
            {message.attachments.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt=""
                className="h-20 w-20 rounded-xl object-cover ring-1 ring-black/5"
              />
            ))}
          </div>
        )}
        {message.content && (
          <div
            className={cn(
              "break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              mine
                ? "whitespace-pre-wrap rounded-tr-md bg-[var(--brand)] text-white"
                : "rounded-tl-md bg-slate-50 text-slate-800 ring-1 ring-slate-100",
            )}
          >
            {mine ? message.content : <MarkdownLite text={message.content} />}
          </div>
        )}
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.actions.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100"
              >
                <Icon name="check" size={11} />
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingRow() {
  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
        <Icon name="sparkles" size={16} />
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Slash menu
/** Command menu shown above a composer while typing `/…` (only `/media` today). */
function SlashMenu({ t, onPick }: { t: AssistantT; onPick: () => void }) {
  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <button
        type="button"
        // mousedown fires before the textarea blur, so the click always lands.
        onMouseDown={(e) => {
          e.preventDefault();
          onPick();
        }}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon name="gallery" size={16} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-900">{t("slashMedia")}</span>
          <span className="block truncate text-xs text-slate-500">{t("slashMediaHint")}</span>
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Image mode
function ModeSwitch({ mode, onChange, t }: { mode: Mode; onChange: (m: Mode) => void; t: AssistantT }) {
  const items: { key: Mode; label: string; icon: IconName }[] = [
    { key: "chat", label: t("modeChat"), icon: "messages" },
    { key: "image", label: t("modeImage"), icon: "gallery" },
  ];
  return (
    <div
      className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5"
      role="tablist"
      aria-label={t("modeSelectAria")}
    >
      {items.map((it) => {
        const active = mode === it.key;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              active
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            <Icon name={it.icon} size={14} />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function ImageMessageRow({
  message,
  user,
  t,
}: {
  message: ImageMessage;
  user: { name: string; avatarUrl: string | null };
  t: AssistantT;
}) {
  const mine = message.role === "user";
  const initial = (user.name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <div className={cn("flex gap-3", mine ? "flex-row-reverse" : "flex-row")}>
      {mine ? (
        user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-black/5"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white ring-1 ring-black/5">
            {initial}
          </span>
        )
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          <Icon name="sparkles" size={16} />
        </span>
      )}
      <div className={cn("flex max-w-[85%] flex-col gap-2", mine ? "items-end" : "items-start")}>
        {message.prompt && (
          <div
            className={cn(
              "whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              mine
                ? "rounded-tr-md bg-[var(--brand)] text-white"
                : "rounded-tl-md bg-slate-50 text-slate-800 ring-1 ring-slate-100",
            )}
          >
            {message.prompt}
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {message.attachments.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={t("templateAlt")}
                className="h-20 w-20 rounded-xl object-cover ring-1 ring-black/5"
              />
            ))}
          </div>
        )}
        {message.text && !mine && (
          <div className="rounded-2xl rounded-tl-md bg-slate-50 px-4 py-2.5 text-sm leading-relaxed text-slate-800 ring-1 ring-slate-100">
            {message.text}
          </div>
        )}
        {message.images && message.images.length > 0 && (
          <div className={cn("grid gap-2", message.images.length > 1 ? "sm:grid-cols-2" : "")}>
            {message.images.map((src, i) => (
              <figure key={i} className="group relative overflow-hidden rounded-2xl ring-1 ring-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={t("generatedAlt")} className="w-full object-cover" />
                <a
                  href={`${src}${src.includes("?") ? "&" : "?"}download=aera-bild-${i + 1}.png`}
                  download
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-slate-900/70 px-2 py-1 text-xs font-semibold text-white opacity-0 backdrop-blur transition group-hover:opacity-100"
                >
                  <Icon name="export" size={13} />
                  {t("save")}
                </a>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GeneratingRow({ t }: { t: AssistantT }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
        <Icon name="sparkles" size={16} />
      </span>
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
        <span className="flex gap-1">
          {[0, 150, 300].map((d) => (
            <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />
          ))}
        </span>
        <span className="text-xs font-medium text-slate-500">{t("generating")}</span>
      </div>
    </div>
  );
}
