"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./icons";
import { UploadError, uploadMediaFile } from "@/lib/client-upload";

/**
 * Ein Feld fuer mehrere Bilder *oder* ein Video.
 *
 * Zwei getrennte Kaesten haetten vom Creator eine Entscheidung verlangt,
 * bevor er die Datei ueberhaupt gewaehlt hat. Hier werden Dateien gewaehlt und
 * der Typ ergibt sich: Bilder sammeln sich in `imageName` (JSON-Liste in
 * Anzeigereihenfolge, per Ziehen sortierbar), ein Video landet in `videoName`.
 *
 * Bild und Video zusammen geht bewusst nicht — eine Beitragskarte kann beides
 * nicht sinnvoll nebeneinander zeigen. Ein Video ersetzt darum die Bilder und
 * umgekehrt; das steht auch als Hinweis im Feld, statt still zu passieren.
 */

/** Mehr Bilder traegt weder die Karte noch die Geduld beim Sortieren. */
export const MAX_IMAGES = 10;

export function MediaUpload({
  tenant,
  imageName = "imageUrls",
  videoName = "videoUrl",
  imagePurpose,
  videoPurpose,
  defaultImageUrls = [],
  defaultVideoUrl = null,
}: {
  tenant: string;
  imageName?: string;
  videoName?: string;
  imagePurpose: string;
  videoPurpose: string;
  defaultImageUrls?: string[];
  defaultVideoUrl?: string | null;
}) {
  const t = useTranslations("ui.dashboard");
  const tm = useTranslations("dashboard.spaceContent");
  const [images, setImages] = useState<string[]>(defaultImageUrls);
  const [videoUrl, setVideoUrl] = useState(defaultVideoUrl ?? "");
  const [busy, setBusy] = useState(0);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  const full = images.length >= MAX_IMAGES;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);

    const video = files.find((f) => f.type.startsWith("video/"));
    if (video) {
      // Ein Video ersetzt alles andere — mehrere Videos je Beitrag gibt es nicht.
      setBusy(1);
      setPercent(0);
      try {
        const url = await uploadMediaFile({
          file: video,
          tenant,
          purpose: videoPurpose,
          onProgress: setPercent,
        });
        setImages([]);
        setVideoUrl(url);
      } catch (uploadError) {
        setError(uploadError instanceof UploadError ? uploadError.message : t("uploadFailed"));
      } finally {
        setBusy(0);
      }
      return;
    }

    // Mehr als frei sind, nimmt der Beitrag nicht — lieber hier abschneiden
    // als Dateien hochladen, die danach niemand sieht.
    const batch = files.slice(0, MAX_IMAGES - images.length);
    setBusy(batch.length);
    const done: string[] = [];
    for (const file of batch) {
      setPercent(0);
      try {
        done.push(
          await uploadMediaFile({ file, tenant, purpose: imagePurpose, onProgress: setPercent }),
        );
      } catch (uploadError) {
        setError(uploadError instanceof UploadError ? uploadError.message : t("uploadFailed"));
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (done.length > 0) {
      setVideoUrl("");
      setImages((prev) => [...prev, ...done].slice(0, MAX_IMAGES));
    }
  }

  function reorder(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === target) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  const empty = images.length === 0 && !videoUrl;

  return (
    <div>
      <input type="hidden" name={imageName} value={JSON.stringify(images)} />
      <input type="hidden" name={videoName} value={videoUrl} />

      {videoUrl ? (
        <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-black">
          {/* Erste halbe Sekunde als Standbild — ohne #t bliebe die Flaeche
              schwarz und der Creator saehe nicht, was er hochgeladen hat. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={`${videoUrl}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
            <Icon name="videos" size={12} /> {tm("mediaVideoBadge")}
          </span>
        </div>
      ) : empty ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 transition hover:border-violet-400 hover:bg-violet-50/40"
        >
          <span className="flex flex-col items-center gap-1.5 text-slate-400">
            <Icon name="gallery" size={26} />
            <span className="text-sm font-medium">{tm("mediaUpload")}</span>
            <span className="text-xs">{tm("mediaHint")}</span>
          </span>
          {busy > 0 && <Busy percent={percent} />}
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((url, i) => (
            <div
              key={`${url}-${i}`}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => reorder(i)}
              className="group relative aspect-square cursor-grab overflow-hidden rounded-xl ring-1 ring-slate-200 active:cursor-grabbing"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {tm("mediaCover")}
                </span>
              )}
              <button
                type="button"
                onClick={() => setImages(images.filter((_, j) => j !== i))}
                aria-label={t("remove")}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
          {Array.from({ length: busy }).map((_, i) => (
            <div
              key={`busy-${i}`}
              className="flex aspect-square animate-pulse items-center justify-center rounded-xl bg-slate-100 text-slate-300"
            >
              <Icon name="gallery" size={18} />
            </div>
          ))}
          {!full && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-600"
            >
              <Icon name="plus" size={18} />
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {!empty && (
          <button
            type="button"
            onClick={() => {
              setImages([]);
              setVideoUrl("");
              setError(null);
            }}
            className="text-sm font-medium text-red-600 hover:underline"
          >
            {t("remove")}
          </button>
        )}
        {images.length > 1 && (
          <span className="text-xs text-slate-400">{tm("mediaOrderHint")}</span>
        )}
        {images.length > 0 && (
          <span className="ml-auto text-xs tabular-nums text-slate-400">
            {images.length}/{MAX_IMAGES}
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
        multiple
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}

function Busy({ percent }: { percent: number }) {
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600" />
      <span className="text-xs font-semibold tabular-nums text-slate-500">{percent}%</span>
    </span>
  );
}
