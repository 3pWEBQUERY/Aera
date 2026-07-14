"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Sheet } from "./sheet";
import { Icon, type IconName } from "./icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface LibraryImage {
  id: string;
  url: string;
  name: string;
  contentType: string;
}

type Tool = "create" | "edit" | "remove-bg" | "enhance" | "resize";

interface WorkImage {
  /** data: URL for display */
  dataUrl: string;
  mimeType: string;
  /** raw base64 (no prefix) for the API */
  base64: string;
}

interface HistoryEntry {
  url: string;
  tool: Tool | "upload";
}

const RESIZE_PRESETS: { key: string; w: number; h: number }[] = [
  { key: "square", w: 1080, h: 1080 },
  { key: "wide", w: 1920, h: 1080 },
  { key: "portrait", w: 1080, h: 1920 },
  { key: "banner", w: 1920, h: 640 },
];

function dataUrlToParts(dataUrl: string): { mimeType: string; base64: string } {
  const [head, base64] = dataUrl.split(",");
  const mimeType = head.match(/data:([^;]+);/)?.[1] ?? "image/png";
  return { mimeType, base64 };
}

async function fileToWorkImage(file: File): Promise<WorkImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read-failed"));
    r.readAsDataURL(file);
  });
  const { mimeType, base64 } = dataUrlToParts(dataUrl);
  return { dataUrl, mimeType, base64 };
}

async function urlToWorkImage(url: string): Promise<WorkImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch-failed");
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read-failed"));
    r.readAsDataURL(blob);
  });
  const { mimeType, base64 } = dataUrlToParts(dataUrl);
  return { dataUrl, mimeType, base64 };
}

/** Center-cover resize on a client canvas — no AI, no credits. */
async function resizeImage(
  image: WorkImage,
  width: number,
  height: number,
): Promise<WorkImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode-failed"));
    el.src = image.dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-failed");
  const scale = Math.max(width / img.width, height / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
  // PNG keeps transparency (e.g. after background removal).
  const dataUrl = canvas.toDataURL("image/png");
  const { mimeType, base64 } = dataUrlToParts(dataUrl);
  return { dataUrl, mimeType, base64 };
}

/**
 * Image AI Studio — tool-based workspace on top of the existing Gemini /
 * credits / storage stack. Results land in the media library automatically.
 */
export function MediaStudio({
  slug,
  library,
  initialBalance,
  aiEnabled,
  initialImageUrl = null,
}: {
  slug: string;
  library: LibraryImage[];
  initialBalance: number;
  aiEnabled: boolean;
  /** Deep link from the media library ("Edit in Studio"). */
  initialImageUrl?: string | null;
}) {
  const t = useTranslations("dashboard.mediaStudio");

  const [tool, setTool] = useState<Tool>("create");
  const [image, setImage] = useState<WorkImage | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [balance, setBalance] = useState(initialBalance);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [resizeW, setResizeW] = useState(1080);
  const [resizeH, setResizeH] = useState(1080);
  const fileRef = useRef<HTMLInputElement>(null);

  // Deep link: preload the handed-over library image and jump to Edit.
  useEffect(() => {
    if (!initialImageUrl) return;
    let cancelled = false;
    setBusy(true);
    urlToWorkImage(initialImageUrl)
      .then((img) => {
        if (cancelled) return;
        setImage(img);
        setTool("edit");
      })
      .catch(() => {
        if (!cancelled) setError(t("errorLoad"));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImageUrl]);

  const needsImage = tool !== "create";
  const needsPrompt = tool === "create" || tool === "edit";
  const usesAi = tool !== "resize";
  const canApply =
    !busy &&
    (!needsImage || !!image) &&
    (!needsPrompt || prompt.trim().length > 0) &&
    (!usesAi || aiEnabled);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("errorNotImage"));
      return;
    }
    setError(null);
    try {
      setImage(await fileToWorkImage(file));
      if (tool === "create") setTool("edit");
    } catch {
      setError(t("errorLoad"));
    }
  }

  async function pickLibrary(item: LibraryImage) {
    setLibraryOpen(false);
    setError(null);
    setBusy(true);
    try {
      setImage(await urlToWorkImage(item.url));
      if (tool === "create") setTool("edit");
    } catch {
      setError(t("errorLoad"));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!canApply) return;
    setError(null);
    setBusy(true);
    try {
      if (tool === "resize") {
        if (!image) return;
        const w = Math.max(16, Math.min(4096, Math.round(resizeW)));
        const h = Math.max(16, Math.min(4096, Math.round(resizeH)));
        const resized = await resizeImage(image, w, h);
        const res = await fetch("/api/dashboard/media/studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            op: "persist",
            image: { mimeType: resized.mimeType, data: resized.base64 },
          }),
        });
        const json = (await res.json()) as { images?: { url: string }[]; error?: string };
        if (!res.ok || !json.images?.length) throw new Error(json.error ?? "failed");
        setImage(resized);
        setHistory((prev) => [{ url: json.images![0].url, tool }, ...prev].slice(0, 12));
        return;
      }

      const res = await fetch("/api/dashboard/media/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          op: "generate",
          tool,
          prompt: needsPrompt ? prompt.trim() : undefined,
          image:
            needsImage && image
              ? { mimeType: image.mimeType, data: image.base64 }
              : undefined,
        }),
      });
      const json = (await res.json()) as {
        images?: { url: string }[];
        balance?: number;
        outOfCredits?: boolean;
        noImage?: boolean;
        error?: string;
      };
      if (res.status === 402 || json.outOfCredits) {
        setError(t("errorCredits"));
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "failed");
      if (typeof json.balance === "number") setBalance(json.balance);
      if (json.noImage || !json.images?.length) {
        setError(t("errorNoImage"));
        return;
      }
      const url = json.images[0].url;
      setHistory((prev) => [{ url, tool }, ...prev].slice(0, 12));
      // The result becomes the new working image so tools can be chained.
      setImage(await urlToWorkImage(url));
      if (tool === "create") setTool("edit");
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const tools: { key: Tool; icon: IconName; ai: boolean }[] = [
    { key: "create", icon: "sparkles", ai: true },
    { key: "edit", icon: "edit", ai: true },
    { key: "remove-bg", icon: "eraser", ai: true },
    { key: "enhance", icon: "bolt", ai: true },
    { key: "resize", icon: "expand", ai: false },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      {/* Topbar */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/dashboard/${slug}/media`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t("back")}
          >
            <Icon name="chevron" size={18} className="rotate-90" />
          </Link>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon name="sparkles" size={17} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-slate-900">{t("title")}</h1>
            <p className="hidden truncate text-xs text-slate-400 sm:block">{t("subtitle")}</p>
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
          title={t("creditsHint")}
        >
          <Icon name="bolt" size={13} />
          {new Intl.NumberFormat().format(balance)} {t("credits")}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Tool rail */}
        <aside className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-200 bg-white p-2.5 lg:w-56 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:p-3">
          <div className="flex gap-1.5 lg:flex-col">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon name="plus" size={17} className="text-slate-400" />
              {t("upload")}
            </button>
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon name="gallery" size={17} className="text-slate-400" />
              {t("fromLibrary")}
            </button>
          </div>
          <div className="mx-1 hidden h-px bg-slate-100 lg:my-2 lg:block" />
          <div className="flex gap-1.5 lg:flex-col">
            {tools.map((item) => {
              const activeTool = tool === item.key;
              const disabled = item.ai && !aiEnabled;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => setTool(item.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                    activeTool
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    disabled && "cursor-not-allowed opacity-40",
                  )}
                >
                  <Icon
                    name={item.icon}
                    size={17}
                    className={activeTool ? "text-white/80" : "text-slate-400"}
                  />
                  {t(`tool_${item.key}`)}
                  {item.ai && (
                    <span
                      className={cn(
                        "ml-auto hidden rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase lg:inline",
                        activeTool ? "bg-white/15 text-white/80" : "bg-slate-100 text-slate-400",
                      )}
                    >
                      KI
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {!aiEnabled && (
            <p className="mt-auto hidden rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700 lg:block">
              {t("aiOff")}
            </p>
          )}
        </aside>

        {/* Canvas + controls */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-6">
            {image ? (
              <div className="relative max-h-full">
                {/* Checkerboard shows through transparency (e.g. removed bg). */}
                <div
                  className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%),linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%)",
                    backgroundSize: "20px 20px",
                    backgroundPosition: "0 0,10px 10px",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.dataUrl}
                    alt=""
                    className={cn(
                      "max-h-[52vh] w-auto max-w-full object-contain lg:max-h-[60vh]",
                      busy && "opacity-60",
                    )}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  aria-label={t("clearImage")}
                  className="absolute -right-2.5 -top-2.5 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow transition hover:text-slate-900"
                >
                  <Icon name="close" size={15} />
                </button>
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-slate-900/85 px-4 py-2 text-sm font-semibold text-white">
                      {t("working")}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full max-w-md flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-slate-400 transition hover:border-slate-400 hover:text-slate-600"
              >
                <Icon name="gallery" size={28} />
                <span className="text-sm font-medium text-slate-600">
                  {tool === "create" ? t("emptyCreate") : t("emptyPick")}
                </span>
                <span className="text-xs">{t("emptyHint")}</span>
              </button>
            )}
          </div>

          {/* Action bar */}
          <div className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
            {error && (
              <p className="mb-2.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              {needsPrompt && (
                <div className="min-w-0 flex-1">
                  <Label htmlFor="studio-prompt">
                    {tool === "create" ? t("promptCreate") : t("promptEdit")}
                  </Label>
                  <Textarea
                    id="studio-prompt"
                    rows={2}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      tool === "create"
                        ? t("promptCreatePlaceholder")
                        : t("promptEditPlaceholder")
                    }
                  />
                </div>
              )}
              {tool === "resize" && (
                <div className="min-w-0 flex-1">
                  <Label>{t("resizeTarget")}</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {RESIZE_PRESETS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          setResizeW(p.w);
                          setResizeH(p.h);
                        }}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                          resizeW === p.w && resizeH === p.h
                            ? "bg-slate-900 text-white"
                            : "border border-slate-200 text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        {t(`resize_${p.key}`)} · {p.w}×{p.h}
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={16}
                        max={4096}
                        value={resizeW}
                        onChange={(e) => setResizeW(Number(e.target.value))}
                        aria-label={t("width")}
                        className="w-24"
                      />
                      <span className="text-slate-400">×</span>
                      <Input
                        type="number"
                        min={16}
                        max={4096}
                        value={resizeH}
                        onChange={(e) => setResizeH(Number(e.target.value))}
                        aria-label={t("height")}
                        className="w-24"
                      />
                    </div>
                  </div>
                </div>
              )}
              {!needsPrompt && tool !== "resize" && (
                <p className="min-w-0 flex-1 self-center text-sm text-slate-500">
                  {t(`hint_${tool}`)}
                </p>
              )}
              <button
                type="button"
                onClick={apply}
                disabled={!canApply}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name={busy ? "clock" : "sparkles"} size={16} />
                {busy ? t("working") : t(`apply_${tool}`)}
                {usesAi && !busy && (
                  <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-bold">
                    1 {t("credit")}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Session history */}
          {history.length > 0 && (
            <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t("history")}
              </p>
              <div className="scrollbar-none flex gap-2 overflow-x-auto">
                {history.map((h, i) => (
                  <div key={`${h.url}-${i}`} className="group relative shrink-0">
                    <button
                      type="button"
                      onClick={() => void urlToWorkImage(h.url).then(setImage)}
                      className="block h-16 w-16 overflow-hidden rounded-lg border border-slate-200 transition hover:border-slate-400"
                      aria-label={t("historyUse")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.url} alt="" className="h-full w-full object-cover" />
                    </button>
                    <a
                      href={h.url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("download")}
                      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 opacity-0 shadow transition hover:text-slate-900 group-hover:opacity-100"
                    >
                      <Icon name="external" size={11} />
                    </a>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">{t("historySaved")}</p>
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Library picker */}
      <Sheet
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        title={t("fromLibrary")}
        subtitle={t("fromLibraryHint")}
        icon="gallery"
      >
        <div className="flex-1 overflow-y-auto p-6">
          {library.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">{t("libraryEmpty")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {library.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void pickLibrary(item)}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  title={item.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}
