"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./icons";
import { UploadError, uploadMediaFile } from "@/lib/client-upload";

/**
 * Ein Feld fuer Bild *oder* Video.
 *
 * Zwei getrennte Kaesten unter einer Ueberschrift waeren die einfachere
 * Loesung gewesen, verlangen aber vom Creator eine Entscheidung, bevor er die
 * Datei ueberhaupt gewaehlt hat. Hier wird eine Datei gewaehlt und der Typ
 * ergibt sich: Bilder landen in `imageName`, Videos in `videoName`, jeweils
 * mit dem passenden Upload-Zweck. Das jeweils andere Feld bleibt leer.
 *
 * Beides gleichzeitig geht bewusst nicht — ein Beitrag mit Bild *und* Video
 * hat keine sinnvolle Darstellung in der Karte, und die zweite Wahl ersetzt
 * darum die erste.
 */
export function MediaUpload({
  tenant,
  imageName = "imageUrl",
  videoName = "videoUrl",
  imagePurpose,
  videoPurpose,
  defaultImageUrl = null,
  defaultVideoUrl = null,
}: {
  tenant: string;
  imageName?: string;
  videoName?: string;
  imagePurpose: string;
  videoPurpose: string;
  defaultImageUrl?: string | null;
  defaultVideoUrl?: string | null;
}) {
  const t = useTranslations("uiMigration.dashboard");
  const tMedia = useTranslations("dashboard.spaceContent");
  const [imageUrl, setImageUrl] = useState(defaultImageUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(defaultVideoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasMedia = Boolean(imageUrl || videoUrl);

  function clear() {
    setImageUrl("");
    setVideoUrl("");
    setError(null);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    setError(null);
    setUploading(true);
    setPercent(0);
    try {
      const url = await uploadMediaFile({
        file,
        tenant,
        purpose: isVideo ? videoPurpose : imagePurpose,
        onProgress: setPercent,
      });
      // Die neue Datei ersetzt die alte, egal welchen Typs sie war.
      setImageUrl(isVideo ? "" : url);
      setVideoUrl(isVideo ? url : "");
    } catch (uploadError) {
      setError(
        uploadError instanceof UploadError ? uploadError.message : t("uploadFailed"),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input type="hidden" name={imageName} value={imageUrl} />
      <input type="hidden" name={videoName} value={videoUrl} />

      <div
        onClick={() => !uploading && fileRef.current?.click()}
        className="relative flex aspect-[16/9] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 transition hover:border-violet-400 hover:bg-violet-50/40"
      >
        {videoUrl ? (
          // Erste halbe Sekunde als Standbild — ohne #t bliebe die Flaeche
          // schwarz und der Creator saehe nicht, was er hochgeladen hat.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={`${videoUrl}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full bg-black object-contain"
          />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-slate-400">
            <Icon name="gallery" size={26} />
            <span className="text-sm font-medium">{tMedia("mediaUpload")}</span>
            <span className="text-xs">{tMedia("mediaHint")}</span>
          </div>
        )}

        {videoUrl && !uploading && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
            <Icon name="videos" size={12} /> {tMedia("mediaVideoBadge")}
          </span>
        )}

        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600" />
            <span className="text-xs font-semibold tabular-nums text-slate-500">{percent}%</span>
          </div>
        )}
      </div>

      {(hasMedia || error) && (
        <div className="mt-2 flex items-center gap-3">
          {hasMedia && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              {t("change")}
            </button>
          )}
          {hasMedia && (
            <button
              type="button"
              onClick={clear}
              className="text-sm font-medium text-red-600 hover:underline"
            >
              {t("remove")}
            </button>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
