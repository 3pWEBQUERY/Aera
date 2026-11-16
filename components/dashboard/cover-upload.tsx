"use client";

import { useRef, useState, useTransition } from "react";
import {
  setCommunityCoverAction,
  removeCommunityCoverAction,
} from "@/app/actions/cover";
import { uploadMediaFile, useUploadErrorText } from "@/lib/client-upload";
import { UploadFieldError } from "@/components/ui/upload-error";
import { Icon } from "./icons";
import { useTranslations } from "next-intl";

/**
 * Community hero cover. Uploads apply immediately (the newest cover wins);
 * removing falls back to the brand gradient.
 *
 * Ohne Titelbild ist die ganze Fläche ein echter Button — vorher war sie nur
 * per Maus erreichbar. Ein Fehler steht genau einmal, direkt unter dem Feld.
 */
export function CoverUpload({
  tenant,
  defaultUrl,
  onChange,
  showAppliedHint = true,
}: {
  tenant: string;
  defaultUrl: string | null;
  /** Meldet die neue Adresse (leer = entfernt), z. B. für eine Vorschau. */
  onChange?: (url: string) => void;
  /** „Wird sofort übernommen.“ — aus, wenn die Umgebung das schon sagt. */
  showAppliedHint?: boolean;
}) {
  const t = useTranslations("ui.dashboard");
  const uploadErrorText = useUploadErrorText();
  const [url, setUrlState] = useState(defaultUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedFile, setFailedFile] = useState<File | null>(null);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function setUrl(next: string) {
    setUrlState(next);
    onChange?.(next);
  }

  async function upload(file: File) {
    setError(null);
    setFailedFile(null);
    setUploading(true);
    try {
      const uploadedUrl = await uploadMediaFile({
        file,
        tenant,
        purpose: "community-cover",
      });
      setUrl(uploadedUrl);
      const afd = new FormData();
      afd.set("tenant", tenant);
      startTransition(() => setCommunityCoverAction(afd));
    } catch (uploadError) {
      setError(uploadErrorText(uploadError));
      setFailedFile(file);
    } finally {
      setUploading(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await upload(file);
  }

  function onRemove() {
    setUrl("");
    const fd = new FormData();
    fd.set("tenant", tenant);
    startTransition(() => removeCommunityCoverAction(fd));
  }

  const pick = () => !uploading && fileRef.current?.click();
  const frame =
    "relative flex aspect-[4/1] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 transition";

  return (
    <div className="min-w-0">
      {url ? (
        <div
          // Klick aufs Bild ist eine Abkürzung für die Maus; Tastatur und
          // Screenreader nutzen „Ändern“ darunter.
          onClick={pick}
          className={`${frame} cursor-pointer hover:border-[var(--brand)]`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={t("coverAlt")} className="h-full w-full object-cover" />
          {uploading && <Spinner />}
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className={`${frame} cursor-pointer hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]`}
        >
          <span className="flex flex-col items-center gap-1 px-3 text-center text-slate-600">
            <Icon name="gallery" size={22} />
            <span className="text-sm font-medium">{t("uploadHeader")}</span>
            <span className="text-xs text-slate-500">{t("headerHint")}</span>
          </span>
          {uploading && <Spinner />}
        </button>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {url && (
          <>
            <button
              type="button"
              onClick={pick}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              {t("change")}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-sm font-medium text-red-700 hover:underline"
            >
              {t("remove")}
            </button>
          </>
        )}
        {showAppliedHint && <span className="text-xs text-slate-500">{t("appliedImmediately")}</span>}
      </div>
      <UploadFieldError
        message={error}
        retrying={uploading}
        onRetry={failedFile ? () => void upload(failedFile) : undefined}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPick}
      />
    </div>
  );
}

function Spinner() {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-white/70">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--brand)]" />
    </span>
  );
}
