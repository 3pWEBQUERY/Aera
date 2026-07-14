"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./icons";

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
};

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

  const [html, setHtml] = useState(defaultHtml);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  async function uploadAndInsert(file: File, kind: "image" | "video") {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("tenant", tenant);
      fd.set("purpose", kind === "image" ? "blog-image" : "blog-video");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? t("uploadFailed"));
        return;
      }
      const media =
        kind === "image"
          ? `<img src="${json.url}" alt="" />`
          : `<video src="${json.url}" controls></video>`;
      insertHtmlAtCaret(`${media}<p><br></p>`);
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
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
  ];

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

      {/* Editor */}
      <div className="relative">
        {isEmpty && (
          <p className="pointer-events-none absolute left-4 top-4 text-[15px] text-slate-400">{placeholder ?? t("placeholder")}</p>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onBlur={saveSelection}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
            sync();
          }}
          className="rich-content min-h-[260px] w-full px-4 py-4 text-[15px] leading-relaxed text-slate-800 outline-none"
        />
      </div>

      {error && <p className="border-t border-slate-200 bg-red-50 px-4 py-2 text-xs text-red-600">{error}</p>}

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
    </div>
  );
}
