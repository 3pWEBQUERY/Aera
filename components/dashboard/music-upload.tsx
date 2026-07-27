"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./icons";
import { UploadError, uploadMediaFile } from "@/lib/client-upload";

export interface MusicUploadItem {
  url: string;
  name: string;
}

/** So viele Titel nimmt ein Durchgang — mehr wird unuebersichtlich. */
export const MAX_TRACKS = 20;

/**
 * Mehrere Audiodateien auf einmal.
 *
 * Aus jeder Datei wird ein eigener Titel; der Dateiname ohne Endung ist der
 * Vorschlag, bearbeitbar bleibt er hier. Das ist der Unterschied zum Podcast,
 * wo eine Episode einzeln gepflegt wird: ein Album laedt man am Stueck hoch.
 */
export function MusicUpload({
  tenant,
  name = "tracks",
  purpose,
}: {
  tenant: string;
  name?: string;
  purpose: string;
}) {
  const t = useTranslations("dashboard.spaceContent");
  const [items, setItems] = useState<MusicUploadItem[]>([]);
  const [busy, setBusy] = useState(0);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    const batch = files.slice(0, MAX_TRACKS - items.length);
    setBusy(batch.length);
    const done: MusicUploadItem[] = [];
    for (const file of batch) {
      setPercent(0);
      try {
        const url = await uploadMediaFile({ file, tenant, purpose, onProgress: setPercent });
        done.push({ url, name: file.name.replace(/\.[^.]+$/, "").slice(0, 160) });
      } catch (uploadError) {
        setError(uploadError instanceof UploadError ? uploadError.message : t("uploadFailed"));
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (done.length > 0) setItems((prev) => [...prev, ...done].slice(0, MAX_TRACKS));
  }

  function reorder(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === target) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />

      {items.length > 0 && (
        <ol className="mb-2 space-y-1.5">
          {items.map((item, i) => (
            <li
              key={`${item.url}-${i}`}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => reorder(i)}
              className="flex cursor-grab items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 active:cursor-grabbing"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--action-soft)] text-slate-600">
                <Icon name="music" size={15} />
              </span>
              <input
                value={item.name}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, name: e.target.value.slice(0, 160) } : x)),
                  )
                }
                aria-label={t("trackTitleAria")}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition focus:border-slate-200 focus:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                aria-label={t("removeTrackAria")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {busy > 0 && (
        <p className="mb-2 text-xs font-medium tabular-nums text-slate-500">
          {t("trackUploading", { count: busy, percent })}
        </p>
      )}

      {items.length < MAX_TRACKS && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-8 text-slate-400 transition hover:border-violet-400 hover:bg-violet-50/40"
        >
          <Icon name="music" size={24} />
          <span className="text-sm font-medium">{t("trackUpload")}</span>
          <span className="text-xs">{t("trackUploadHint")}</span>
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg"
        multiple
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
