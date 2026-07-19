"use client";

import { useRef, useState } from "react";
import { Icon } from "./icons";
import { initials } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { UploadError, uploadMediaFile } from "@/lib/client-upload";

export function AvatarUpload({
  tenant,
  name = "avatarUrl",
  defaultUrl = null,
  fallbackName = "",
  purpose = "avatar",
  onChange,
}: {
  tenant: string;
  name?: string;
  defaultUrl?: string | null;
  fallbackName?: string;
  purpose?: string;
  onChange?: (url: string) => void;
}) {
  const t = useTranslations("uiMigration.dashboard");
  const [url, setUrlState] = useState<string>(defaultUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function setUrl(next: string) {
    setUrlState(next);
    onChange?.(next);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const uploadedUrl = await uploadMediaFile({ file, tenant, purpose });
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
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-violet-100 text-xl font-semibold text-violet-700">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="Avatar" className="h-full w-full object-cover" />
            ) : fallbackName ? (
              initials(fallbackName)
            ) : (
              <Icon name="members" size={28} />
            )}
          </div>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600" />
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Icon name="gallery" size={16} />
              {url ? t("change") : t("uploadImage")}
            </button>
            {url && (
              <button
                type="button"
                onClick={() => setUrl("")}
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                {t("remove")}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">{t("imageHint")}</p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
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
