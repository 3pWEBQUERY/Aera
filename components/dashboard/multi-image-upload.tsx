"use client";

import { useRef, useState } from "react";
import { Icon } from "./icons";
import { useTranslations } from "next-intl";

/**
 * Upload and manage several product images. The first image is the cover
 * (mirrored to `coverUrl` server-side). Emits repeated hidden `<input name>`
 * fields plus an `imagesSubmitted` marker so the action can distinguish an
 * empty gallery from a form that didn't include the field.
 */
export function MultiImageUpload({
  tenant,
  name = "images",
  defaultUrls = [],
  purpose = "product-cover",
  max = 8,
}: {
  tenant: string;
  name?: string;
  defaultUrls?: string[];
  purpose?: string;
  max?: number;
}) {
  const t = useTranslations("uiMigration.dashboard");
  const [urls, setUrls] = useState<string[]>(defaultUrls.filter(Boolean));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const remaining = max - urls.length;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    const added: string[] = [];
    try {
      for (const file of files.slice(0, remaining)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("tenant", tenant);
        fd.set("purpose", purpose);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) {
          setError(json.error ?? t("uploadFailed"));
          break;
        }
        added.push(json.url);
      }
      if (added.length) setUrls((prev) => [...prev, ...added].slice(0, max));
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  const removeAt = (i: number) => setUrls((prev) => prev.filter((_, idx) => idx !== i));
  const makeCover = (i: number) =>
    setUrls((prev) => {
      if (i === 0) return prev;
      const copy = [...prev];
      const [pick] = copy.splice(i, 1);
      return [pick, ...copy];
    });

  return (
    <div>
      {urls.map((u) => (
        <input key={u} type="hidden" name={name} value={u} />
      ))}
      <input type="hidden" name="imagesSubmitted" value="1" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {urls.map((u, i) => (
          <div
            key={u}
            className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="h-full w-full object-cover" />

            {i === 0 && (
              <span className="absolute left-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                {t("coverBadge")}
              </span>
            )}

            <div className="absolute inset-0 flex items-end justify-between gap-1 bg-gradient-to-t from-slate-900/60 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
              {i !== 0 ? (
                <button
                  type="button"
                  onClick={() => makeCover(i)}
                  className="rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-slate-800 transition hover:bg-white"
                >
                  {t("setAsCover")}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={t("removeImage")}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-red-600 transition hover:bg-white"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          </div>
        ))}

        {urls.length < max && (
          <button
            type="button"
            onClick={() => !uploading && fileRef.current?.click()}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 transition hover:border-violet-400 hover:bg-violet-50/40"
          >
            {uploading ? (
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600" />
            ) : (
              <>
                <Icon name="plus" size={22} />
                <span className="text-sm font-medium">{t("addImage")}</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <p className="text-xs text-slate-400">
          {t("imageCount", { count: urls.length, max })}
        </p>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
