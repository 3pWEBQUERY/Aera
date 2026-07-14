"use client";

import { useRef, useState } from "react";
import { Icon } from "./icons";
import { useTranslations } from "next-intl";

interface MItem {
  key: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  caption: string;
}
interface Uploading {
  key: string;
  name: string;
  type: "IMAGE" | "VIDEO";
  progress: number;
}

let seq = 0;
const nextKey = () => `m${Date.now()}_${seq++}`;

/**
 * Upload and arrange many images + videos as one bundle. Emits a hidden JSON
 * field (`name`) of `{ type, url, caption }[]` in display order.
 */
export function MultiMediaUpload({
  tenant,
  name = "items",
  purpose = "gallery",
  defaultItems = [],
}: {
  tenant: string;
  name?: string;
  purpose?: string;
  defaultItems?: { type: "IMAGE" | "VIDEO"; url: string; caption?: string | null }[];
}) {
  const t = useTranslations("uiMigration.dashboard");
  const [items, setItems] = useState<MItem[]>(() =>
    defaultItems.map((d) => ({ key: nextKey(), type: d.type, url: d.url, caption: d.caption ?? "" })),
  );
  const [uploads, setUploads] = useState<Uploading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    const type: "IMAGE" | "VIDEO" = file.type.startsWith("video") ? "VIDEO" : "IMAGE";
    const key = nextKey();
    setUploads((u) => [...u, { key, name: file.name, type, progress: 0 }]);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const p = Math.round((ev.loaded / ev.total) * 100);
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x)));
      }
    };
    xhr.onload = () => {
      setUploads((u) => u.filter((x) => x.key !== key));
      try {
        const j = JSON.parse(xhr.responseText) as { url?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && j.url) {
          setItems((it) => [...it, { key: nextKey(), type, url: j.url!, caption: "" }]);
        } else setError(j.error ?? t("uploadFailed"));
      } catch {
        setError(t("uploadFailed"));
      }
    };
    xhr.onerror = () => {
      setUploads((u) => u.filter((x) => x.key !== key));
      setError(t("uploadFailed"));
    };
    const fd = new FormData();
    fd.set("file", file);
    fd.set("tenant", tenant);
    fd.set("purpose", purpose);
    xhr.send(fd);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setError(null);
    files.forEach(upload);
  }

  function remove(key: string) {
    setItems((it) => it.filter((x) => x.key !== key));
  }
  function move(key: string, dir: -1 | 1) {
    setItems((it) => {
      const i = it.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= it.length) return it;
      const copy = [...it];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function setCaption(key: string, v: string) {
    setItems((it) => it.map((x) => (x.key === key ? { ...x, caption: v } : x)));
  }

  const payload = JSON.stringify(
    items.map(({ type, url, caption }) => ({ type, url, caption: caption || undefined })),
  );

  return (
    <div>
      <input type="hidden" name={name} value={payload} />

      {(items.length > 0 || uploads.length > 0) && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((it, idx) => (
            <div
              key={it.key}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
            >
              <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
                {it.type === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video src={it.url} preload="metadata" className="absolute inset-0 h-full w-full bg-black object-cover" />
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      <Icon name="videos" size={11} /> Video
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => remove(it.key)}
                  aria-label={t("removeMedia")}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-red-600 shadow hover:bg-white sm:opacity-0 sm:transition sm:group-hover:opacity-100"
                >
                  <Icon name="close" size={13} />
                </button>
                <div className="absolute bottom-1.5 left-1.5 flex gap-1 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => move(it.key, -1)}
                    aria-label={t("moveForward")}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-slate-700 shadow transition hover:bg-white disabled:opacity-30"
                  >
                    <Icon name="chevron" size={13} className="rotate-90" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === items.length - 1}
                    onClick={() => move(it.key, 1)}
                    aria-label={t("moveBackward")}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-slate-700 shadow transition hover:bg-white disabled:opacity-30"
                  >
                    <Icon name="chevron" size={13} className="-rotate-90" />
                  </button>
                </div>
              </div>
              <input
                value={it.caption}
                onChange={(e) => setCaption(it.key, e.target.value)}
                placeholder={t("captionPlaceholder")}
                className="w-full border-t border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:bg-slate-50"
              />
            </div>
          ))}
          {uploads.map((u) => (
            <div
              key={u.key}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-slate-400"
              style={{ aspectRatio: "1 / 1" }}
            >
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600" />
              <span className="w-full truncate text-center text-[11px]">{u.name}</span>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${u.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        onClick={() => fileRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-7 text-slate-400 transition hover:border-violet-400 hover:bg-violet-50/40"
      >
        <Icon name="gallery" size={24} />
        <span className="text-sm font-medium text-slate-600">{t("addMedia")}</span>
        <span className="text-xs">{t("mediaHint")}</span>
      </div>

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-m4v,video/ogg"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
