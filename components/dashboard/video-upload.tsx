"use client";

import { useRef, useState } from "react";
import { UploadError, uploadMediaFile } from "@/lib/client-upload";
import { Icon } from "./icons";
import { useTranslations } from "next-intl";

export function VideoUpload({
  tenant,
  name = "videoUrl",
  defaultUrl = null,
  purpose = "course-video",
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
  const [showUrl, setShowUrl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick() {
    fileRef.current?.click();
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const uploadedUrl = await uploadMediaFile({
        file,
        tenant,
        purpose,
        onProgress: setProgress,
      });
      setUrl(uploadedUrl);
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

  return (
    <div>
      <input type="hidden" name={name} value={url} />

      {url ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={url} controls className="w-full rounded-xl border border-slate-200 bg-black" />
          <div className="flex items-center gap-3">
            <button type="button" onClick={pick} className="text-sm font-medium text-slate-600 hover:text-slate-900">{t("otherVideo")}</button>
            <button type="button" onClick={() => setUrl("")} className="text-sm font-medium text-red-600 hover:underline">{t("remove")}</button>
          </div>
        </div>
      ) : uploading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{t("uploadingVideo")}</span>
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
          <Icon name="videos" size={26} />
          <span className="text-sm font-medium text-slate-600">{t("uploadVideo")}</span>
          <span className="text-xs">{t("videoHint")}</span>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      {!url && !uploading && (
        <div className="mt-2">
          {showUrl ? (
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… (YouTube, Vimeo, MP4-Link)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            />
          ) : (
            <button type="button" onClick={() => setShowUrl(true)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
              {t("videoUrl")}
            </button>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-m4v,video/ogg" className="hidden" onChange={onPick} />
    </div>
  );
}
