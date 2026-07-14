"use client";

import { useRef, useState } from "react";
import { Icon } from "./icons";
import { useTranslations } from "next-intl";

/** Audio upload with progress — mirrors VideoUpload (podcast episodes). */
export function AudioUpload({
  tenant,
  name = "audioUrl",
  defaultUrl = null,
  purpose = "podcast-audio",
}: {
  tenant: string;
  name?: string;
  defaultUrl?: string | null;
  purpose?: string;
}) {
  const t = useTranslations("uiMigration.dashboard");
  const [url, setUrl] = useState<string>(defaultUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick() {
    fileRef.current?.click();
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      try {
        const j = JSON.parse(xhr.responseText) as { url?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && j.url) setUrl(j.url);
        else setError(j.error ?? t("uploadFailed"));
      } catch {
        setError(t("uploadFailed"));
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setError(t("uploadFailed"));
    };
    const fd = new FormData();
    fd.set("file", file);
    fd.set("tenant", tenant);
    fd.set("purpose", purpose);
    xhr.send(fd);
  }

  return (
    <div>
      <input type="hidden" name={name} value={url} />

      {url ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={url} controls className="w-full" />
          <div className="flex items-center gap-3">
            <button type="button" onClick={pick} className="text-sm font-medium text-slate-600 hover:text-slate-900">{t("otherFile")}</button>
            <button type="button" onClick={() => setUrl("")} className="text-sm font-medium text-red-600 hover:underline">{t("remove")}</button>
          </div>
        </div>
      ) : uploading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{t("uploadingAudio")}</span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <div
          onClick={pick}
          className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-slate-400 transition hover:border-violet-400 hover:bg-violet-50/40"
        >
          <Icon name="podcast" size={26} />
          <span className="text-sm font-medium text-slate-600">{t("uploadAudio")}</span>
          <span className="text-xs">{t("audioHint")}</span>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
