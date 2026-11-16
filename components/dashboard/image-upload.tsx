"use client";

import { useRef, useState } from "react";
import { Icon } from "./icons";
import { useTranslations } from "next-intl";
import { uploadMediaFile, useUploadErrorText } from "@/lib/client-upload";
import { UploadFieldError } from "@/components/ui/upload-error";
import { MediaPickerSheet } from "./media-picker-sheet";

export function ImageUpload({
  tenant,
  name = "coverUrl",
  defaultUrl = null,
  purpose = "cover",
  onChange,
  libraryPicker = false,
}: {
  tenant: string;
  name?: string;
  defaultUrl?: string | null;
  purpose?: string;
  onChange?: (url: string) => void;
  /** Zeigt „Aus Mediathek wählen“ neben dem Upload. */
  libraryPicker?: boolean;
}) {
  const t = useTranslations("ui.dashboard");
  const [url, setUrlState] = useState<string>(defaultUrl ?? "");
  const setUrl = (v: string) => {
    setUrlState(v);
    onChange?.(v);
  };
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedFile, setFailedFile] = useState<File | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const uploadErrorText = useUploadErrorText();
  const tm = useTranslations("dashboard.spaceContent");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await upload(file);
  }

  async function upload(file: File) {
    setError(null);
    setFailedFile(null);
    setUploading(true);
    try {
      const uploadedUrl = await uploadMediaFile({ file, tenant, purpose });
      setUrl(uploadedUrl);
    } catch (uploadError) {
      setError(uploadErrorText(uploadError));
      setFailedFile(file);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={url} />
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        className="relative flex aspect-[16/9] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 transition hover:border-violet-400 hover:bg-violet-50/40"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Cover" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-slate-500">
            <Icon name="gallery" size={26} />
            <span className="text-sm font-medium">{t("uploadCover")}</span>
            <span className="text-xs">{t("coverHint")}</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600" />
          </div>
        )}
      </div>
      {(url || libraryPicker) && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {url && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              {t("change")}
            </button>
          )}
          {url && (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="text-sm font-medium text-red-600 hover:underline"
            >
              {t("remove")}
            </button>
          )}
          {libraryPicker && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-[var(--action-soft)]"
            >
              <Icon name="gallery" size={15} className="text-slate-500" />
              {tm("pickFromLibrary")}
            </button>
          )}
        </div>
      )}
      <UploadFieldError
        message={error}
        retrying={uploading}
        onRetry={failedFile ? () => void upload(failedFile) : undefined}
      />
      {libraryPicker && (
        <MediaPickerSheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          slug={tenant}
          subtitle={tm("pickFromLibraryHint")}
          onPick={(item) => {
            setPickerOpen(false);
            setError(null);
            setFailedFile(null);
            setUrl(item.url);
          }}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
