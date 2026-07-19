"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./icons";
import { UploadError, uploadMediaFile } from "@/lib/client-upload";

/* Small inline glyph icons for the formatting toolbar (kept local & crisp). */
const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const glyphs = {
  bullet: svg(<>
    <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
    <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />
  </>),
  ordered: svg(<>
    <line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" />
    <path d="M4 6h1v3M4 9h2" strokeWidth={1.5} /><path d="M4 15h1.5a.5.5 0 0 1 0 1H4l1.5 1.5H4" strokeWidth={1.5} />
  </>),
  quote: svg(<path d="M7 7H4v5h3l-2 4M17 7h-3v5h3l-2 4" />),
  link: svg(<>
    <path d="M9 15l6-6" /><path d="M11 6l1-1a3.5 3.5 0 0 1 5 5l-1 1" /><path d="M13 18l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
  </>),
  paragraph: svg(<>
    <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="13" y2="17" />
  </>),
  attach: svg(<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />),
  divider: svg(<line x1="4" y1="12" x2="20" y2="12" />),
  record: svg(<>
    <rect x="2.5" y="6.5" width="13" height="11" rx="2.5" />
    <path d="M15.5 10.5l6-3.5v10l-6-3.5" />
    <circle cx="8" cy="12" r="2.6" fill="currentColor" stroke="none" />
  </>),
};

/** Compact, curated emoji set for the composer picker (no external dependency). */
const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
  "😘","😗","😚","😋","😛","😜","🤪","😝","🤗","🤭","🤔","🤨","😐","😶","😏","😌",
  "😔","😪","😴","😒","🙄","😬","🥱","😷","🤒","🤕","🤢","🤮","🥴","😵","🤯","🥶",
  "🥳","😎","🤓","🧐","😢","😭","😤","😠","😡","🤬","😳","🥺","😱","😨","😰","😥",
  "👍","👎","👏","🙌","🤝","🙏","💪","👋","✌️","🤞","🤟","🤙","👌","🤌","✋","👆",
  "👇","👈","👉","💥","🔥","✨","⭐","🌟","💫","💯","✅","❌","⚠️","❓","❗","💤",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","💕","💖","💝","💘","💗","🩷","💌",
  "🎉","🎊","🎁","🏆","🥇","🎯","🚀","💡","📌","🔗","📎","📷","🎥","🎵","🎶","📣",
  "☕","🍕","🍔","🍰","🎂","🍺","🥂","🍫","🍎","🌍","☀️","🌙","⚡","🌈","❄️","🌸",
  "🐶","🐱","🦊","🐻","🐼","🐨","🦁","🐯","🐸","🐵","🦄","🐝","🦋","🌿","🍀","🌵",
] as const;

type Cmd = { icon: React.ReactNode; label: string; run: () => void };

export function RichTextEditor({
  tenant,
  name = "bodyHtml",
  defaultHtml = "",
  placeholder,
}: {
  tenant: string;
  name?: string;
  defaultHtml?: string;
  placeholder?: string;
}) {
  const t = useTranslations("dashboard.rte");
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [html, setHtml] = useState(defaultHtml);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Slash "/" command menu.
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);

  // Seed the editable region once, imperatively. It is intentionally an
  // *uncontrolled* contentEditable: React never manages its children, so the
  // caret and typed content are never reset on re-render. Safari needs a real
  // block (<p><br></p>) to establish a line box + caret in an empty editor.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const seed = defaultHtml || "<p><br></p>";
    el.innerHTML = seed;
    setHtml(defaultHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasMedia = /<(img|video)/i.test(html);
  const isEmpty = !hasMedia && html.replace(/<[^>]*>/g, "").replace(/(\s|&nbsp;)/g, "") === "";

  function sync() {
    setHtml(editorRef.current?.innerHTML ?? "");
  }
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editorRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    } else {
      // Caret to end.
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    sync();
  }
  function insertHtmlAtCaret(fragment: string) {
    restoreSelection();
    document.execCommand("insertHTML", false, fragment);
    sync();
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  async function uploadAndInsert(file: File, kind: "image" | "video" | "file") {
    setError(null);
    setUploading(true);
    try {
      const purpose =
        kind === "image" ? "blog-image" : kind === "video" ? "blog-video" : "blog-file";
      const uploadedUrl = await uploadMediaFile({ file, tenant, purpose });
      if (kind === "file") {
        const label = escapeHtml(file.name.slice(0, 200)) || t("file");
        insertHtmlAtCaret(
          `<p><a href="${uploadedUrl}" target="_blank" rel="noopener noreferrer">📎 ${label}</a></p><p><br></p>`,
        );
      } else {
        const media =
          kind === "image"
            ? `<img src="${uploadedUrl}" alt="" />`
            : `<video src="${uploadedUrl}" controls></video>`;
        insertHtmlAtCaret(`${media}<p><br></p>`);
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof UploadError
          ? uploadError.message
          : t("uploadFailed"),
      );
    } finally {
      setUploading(false);
    }
  }

  function closeSlash() {
    setSlashOpen(false);
    setSlashQuery("");
    setSlashIndex(0);
  }

  /** After each edit, decide whether a "/…" token under the caret should open
   *  the command menu, and where. Triggers only at a block start or after
   *  whitespace, so URLs like https://… never open it. */
  function updateSlash() {
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.rangeCount) return closeSlash();
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (!editorRef.current?.contains(node) || node.nodeType !== Node.TEXT_NODE) {
      return closeSlash();
    }
    const textBefore = (node.textContent ?? "").slice(0, range.startOffset);
    const slashIdx = textBefore.lastIndexOf("/");
    if (slashIdx === -1) return closeSlash();
    const query = textBefore.slice(slashIdx + 1);
    const before = slashIdx === 0 ? "" : textBefore[slashIdx - 1];
    if ((before !== "" && !/\s/.test(before)) || /\s/.test(query)) return closeSlash();
    const rect = range.getBoundingClientRect();
    setSlashPos({ top: (rect.bottom || rect.top) + 6, left: rect.left });
    setSlashQuery(query);
    setSlashIndex(0);
    setSlashOpen(true);
  }

  /** Remove the typed "/query" and run the chosen block command. */
  function applySlash(cmd: Cmd) {
    const sel = window.getSelection();
    try {
      if (sel && sel.isCollapsed && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const end = range.startOffset;
          const start = Math.max(0, end - (slashQuery.length + 1));
          const del = document.createRange();
          del.setStart(node, start);
          del.setEnd(node, end);
          del.deleteContents();
          const caret = document.createRange();
          caret.setStart(node, start);
          caret.collapse(true);
          sel.removeAllRanges();
          sel.addRange(caret);
        }
      }
    } catch {
      editorRef.current?.focus();
    }
    closeSlash();
    cmd.run();
  }

  function insertEmoji(emoji: string) {
    restoreSelection();
    document.execCommand("insertText", false, emoji);
    sync();
    // Keep the caret after the emoji so several can be added in a row.
    saveSelection();
  }

  function applyLink() {
    const url = linkUrl.trim();
    setLinkOpen(false);
    setLinkUrl("");
    if (!url) return;
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    restoreSelection();
    document.execCommand("createLink", false, safe);
    // Open links in a new tab.
    editorRef.current?.querySelectorAll('a[href="' + safe + '"]').forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
    sync();
  }

  const marks: Cmd[] = [
    { icon: <span className="font-bold">B</span>, label: t("bold"), run: () => exec("bold") },
    { icon: <span className="font-serif italic">I</span>, label: t("italic"), run: () => exec("italic") },
    { icon: <span className="underline">U</span>, label: t("underline"), run: () => exec("underline") },
    { icon: <span className="line-through">S</span>, label: t("strike"), run: () => exec("strikeThrough") },
  ];
  const blocks: Cmd[] = [
    { icon: <span className="text-[13px] font-bold">H2</span>, label: t("h2"), run: () => exec("formatBlock", "<h2>") },
    { icon: <span className="text-[13px] font-bold">H3</span>, label: t("h3"), run: () => exec("formatBlock", "<h3>") },
    { icon: glyphs.bullet, label: t("bullet"), run: () => exec("insertUnorderedList") },
    { icon: glyphs.ordered, label: t("ordered"), run: () => exec("insertOrderedList") },
    { icon: glyphs.quote, label: t("quote"), run: () => exec("formatBlock", "<blockquote>") },
    { icon: glyphs.divider, label: t("divider"), run: () => exec("insertHorizontalRule") },
  ];

  // Blocks offered by the "/" menu (Paragraph first, then the block commands).
  const slashCommands: Cmd[] = [
    { icon: glyphs.paragraph, label: t("paragraph"), run: () => exec("formatBlock", "<p>") },
    ...blocks,
  ];
  const filteredSlash = slashQuery
    ? slashCommands.filter((c) => c.label.toLowerCase().includes(slashQuery.toLowerCase()))
    : slashCommands;

  function Btn({ cmd }: { cmd: Cmd }) {
    return (
      <button
        type="button"
        title={cmd.label}
        aria-label={cmd.label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={cmd.run}
        className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-slate-600 transition hover:bg-white hover:text-slate-900"
      >
        {cmd.icon}
      </button>
    );
  }
  const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 self-center bg-slate-200" />;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-200">
      <input type="hidden" name={name} value={html} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        {marks.map((c) => <Btn key={c.label} cmd={c} />)}
        <Divider />
        {blocks.map((c) => <Btn key={c.label} cmd={c} />)}
        <Divider />
        <button
          type="button"
          title={t("link")}
          aria-label={t("link")}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => setLinkOpen((v) => !v)}
          className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-slate-600 transition hover:bg-white hover:text-slate-900"
        >
          {glyphs.link}
        </button>
        <Divider />
        <button
          type="button"
          title={t("insertImage")}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => imgInput.current?.click()}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-slate-600 transition hover:bg-white hover:text-slate-900"
        >
          <Icon name="gallery" size={15} />
          <span className="text-xs font-medium">{t("image")}</span>
        </button>
        <button
          type="button"
          title={t("insertVideo")}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => vidInput.current?.click()}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-slate-600 transition hover:bg-white hover:text-slate-900"
        >
          <Icon name="videos" size={15} />
          <span className="text-xs font-medium">{t("video")}</span>
        </button>
        <button
          type="button"
          title={t("attach")}
          aria-label={t("attach")}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => fileInput.current?.click()}
          className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-slate-600 transition hover:bg-white hover:text-slate-900"
        >
          {glyphs.attach}
        </button>
        <button
          type="button"
          title={t("record")}
          aria-label={t("record")}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => {
            setEmojiOpen(false);
            setRecordOpen(true);
          }}
          className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-slate-600 transition hover:bg-white hover:text-slate-900"
        >
          {glyphs.record}
        </button>
        <button
          type="button"
          title={t("emoji")}
          aria-label={t("emoji")}
          aria-expanded={emojiOpen}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => {
            setLinkOpen(false);
            setEmojiOpen((v) => !v);
          }}
          className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 transition hover:bg-white hover:text-slate-900 ${emojiOpen ? "bg-white text-slate-900" : "text-slate-600"}`}
        >
          <Icon name="smile" size={16} />
        </button>
        {uploading && (
          <span className="ml-auto inline-flex items-center gap-1.5 pr-1 text-xs text-slate-400">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600" />
            {t("loading")}
          </span>
        )}
      </div>

      {/* Link bar */}
      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkOpen(false);
            }}
            placeholder={t("linkPlaceholder")}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          />
          <button type="button" onClick={applyLink} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
            {t("applyLink")}
          </button>
          <button type="button" onClick={() => setLinkOpen(false)} className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">
            {t("cancel")}
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {emojiOpen && (
        <div className="border-b border-slate-200 bg-white px-2.5 py-2">
          <div className="grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto sm:grid-cols-10">
            {EMOJIS.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                type="button"
                aria-label={emoji}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertEmoji(emoji)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none transition hover:bg-slate-100"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="relative">
        {isEmpty && (
          <p className="pointer-events-none absolute left-4 top-4 text-[15px] text-slate-400">{placeholder ?? t("placeholder")}</p>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => {
            sync();
            updateSlash();
          }}
          onKeyDown={(e) => {
            if (!slashOpen || filteredSlash.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSlashIndex((i) => (i + 1) % filteredSlash.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSlashIndex((i) => (i - 1 + filteredSlash.length) % filteredSlash.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              applySlash(filteredSlash[slashIndex] ?? filteredSlash[0]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              closeSlash();
            }
          }}
          onBlur={() => {
            saveSelection();
            closeSlash();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
            sync();
          }}
          className="rich-content min-h-[260px] w-full px-4 py-4 text-[15px] leading-relaxed text-slate-800 outline-none"
        />
      </div>

      {/* Slash "/" command menu */}
      {slashOpen && slashPos && filteredSlash.length > 0 && (
        <div
          className="fixed z-[130] w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
          style={{ top: slashPos.top, left: slashPos.left }}
        >
          {filteredSlash.map((cmd, i) => (
            <button
              key={cmd.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSlashIndex(i)}
              onClick={() => applySlash(cmd)}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition ${i === slashIndex ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">{cmd.icon}</span>
              {cmd.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="border-t border-slate-200 bg-red-50 px-4 py-2 text-xs text-red-600">{error}</p>}

      {recordOpen && (
        <RecordVideoModal
          t={t}
          onClose={() => setRecordOpen(false)}
          onInsert={(file) => {
            setRecordOpen(false);
            void uploadAndInsert(file, "video");
          }}
        />
      )}

      <input
        ref={imgInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) uploadAndInsert(f, "image");
        }}
      />
      <input
        ref={vidInput}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-m4v,video/ogg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) uploadAndInsert(f, "video");
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,application/zip,.pdf,.zip,.docx,.xlsx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) uploadAndInsert(f, "file");
        }}
      />
    </div>
  );
}

type RecordPhase = "prep" | "live" | "recording" | "recorded";

/**
 * Full-screen camera capture. Records a webm clip via MediaRecorder and hands
 * the finished file back to the editor, which uploads it like any other video.
 * The stream is acquired once and every track is stopped on unmount.
 */
function RecordVideoModal({
  t,
  onClose,
  onInsert,
}: {
  t: ReturnType<typeof useTranslations>;
  onClose: () => void;
  onInsert: (file: File) => void;
}) {
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [phase, setPhase] = useState<RecordPhase>("prep");
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError(t("recUnsupported"));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (liveRef.current) {
          liveRef.current.srcObject = stream;
          void liveRef.current.play().catch(() => {});
        }
        setPhase("live");
      } catch {
        if (!cancelled) setError(t("recDenied"));
      }
    }
    void start();
    return () => {
      cancelled = true;
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setPlaybackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  function startRec() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const preferred = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mimeType = preferred.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      setBlob(new Blob(chunksRef.current, { type: "video/webm" }));
      setPhase("recorded");
    };
    recorderRef.current = rec;
    rec.start();
    setPhase("recording");
  }

  function retake() {
    setBlob(null);
    setPlaybackUrl(null);
    setPhase("live");
    if (liveRef.current) void liveRef.current.play().catch(() => {});
  }

  function insert() {
    if (!blob) return;
    onInsert(new File([blob], `aufnahme-${Date.now()}.webm`, { type: "video/webm" }));
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <p className="text-sm font-bold text-slate-900">{t("record")}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("cancel")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="relative aspect-video w-full bg-slate-900">
          <video
            ref={liveRef}
            muted
            autoPlay
            playsInline
            className={`h-full w-full object-cover ${phase === "recorded" ? "hidden" : "block"}`}
          />
          {phase === "recorded" && playbackUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={playbackUrl} controls playsInline className="h-full w-full object-contain" />
          )}
          {phase === "recording" && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              REC
            </span>
          )}
          {phase === "prep" && !error && (
            <span className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              {t("recPrep")}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3.5">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <span className="text-xs text-slate-400" />
          )}
          <div className="flex shrink-0 items-center gap-2">
            {phase === "live" && (
              <button
                type="button"
                onClick={startRec}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-white" />
                {t("recStart")}
              </button>
            )}
            {phase === "recording" && (
              <button
                type="button"
                onClick={() => recorderRef.current?.stop()}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <span className="h-2.5 w-2.5 rounded-[3px] bg-white" />
                {t("recStop")}
              </button>
            )}
            {phase === "recorded" && (
              <>
                <button
                  type="button"
                  onClick={retake}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {t("recRetake")}
                </button>
                <button
                  type="button"
                  onClick={insert}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {t("recInsert")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
