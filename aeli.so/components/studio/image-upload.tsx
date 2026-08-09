"use client";

import { useId, useRef, useState } from "react";

/**
 * Bild aussuchen, hochladen, sehen.
 *
 * Drei Wege hinein, weil Leute unterschiedlich arbeiten: klicken, hineinziehen
 * oder einfügen (⌘V direkt aus einem Screenshot). Der Fortschritt kommt aus
 * einem `XMLHttpRequest` statt aus `fetch` — nur der meldet, wie viel vom
 * Körper schon draußen ist, und bei einem Foto aus der Kamera im Mobilnetz ist
 * genau das die Sekunde, in der man sonst nicht weiß, ob noch etwas passiert.
 *
 * Der Wert steht in einem versteckten Feld. Das Formular drumherum bleibt damit
 * ein gewöhnliches Formular: Speichern läuft über dieselbe Server-Action wie
 * vorher, und ohne JavaScript geht wenigstens das Entfernen noch.
 */

interface UploadResponse {
  url: string;
  bytes: number;
  originalBytes: number;
  message?: string;
}

export function ImageUpload({
  name,
  label,
  hint,
  value,
  onChange,
  purpose,
  shape,
}: {
  /**
   * Nur setzen, wenn der Wert als eigenes Formularfeld mitgehen soll. Der
   * Hintergrund reist im Theme-JSON und braucht deshalb keins.
   */
  name?: string;
  label: string;
  hint: string;
  value: string;
  onChange: (url: string) => void;
  purpose: "avatar" | "banner" | "background" | "social" | "thumbnail";
  shape: "circle" | "square" | "wide";
}) {
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ bytes: number; originalBytes: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  function upload(file: File) {
    setState("uploading");
    setProgress(0);
    setMessage(null);

    const form = new FormData();
    form.append("purpose", purpose);
    form.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      let payload: UploadResponse | null = null;
      try {
        payload = JSON.parse(request.responseText) as UploadResponse;
      } catch {
        /* Antwort ohne JSON — dann greift die allgemeine Meldung unten. */
      }
      if (request.status >= 200 && request.status < 300 && payload?.url) {
        onChange(payload.url);
        setSaved({ bytes: payload.bytes, originalBytes: payload.originalBytes });
        setState("idle");
        return;
      }
      setState("error");
      setMessage(payload?.message ?? "Das hat nicht geklappt. Versuch es noch einmal.");
    });
    request.addEventListener("error", () => {
      setState("error");
      setMessage("Keine Verbindung. Versuch es noch einmal.");
    });
    request.send(form);
  }

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) upload(file);
  }

  const busy = state === "uploading";

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium text-chalk">
          {label}
        </label>
        {value && !busy && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSaved(null);
              setMessage(null);
              setState("idle");
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="rounded px-1 text-xs text-ash transition-colors hover:text-ember"
          >
            Entfernen
          </button>
        )}
      </div>

      {name && <input type="hidden" name={name} value={value} />}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files);
        }}
        onPaste={(event) => pick(event.clipboardData.files)}
        className={`flex items-center gap-4 rounded-xl border border-dashed p-3 transition-colors ${
          dragging ? "border-signal bg-signal/5" : state === "error" ? "border-ember" : "border-line"
        }`}
      >
        <Preview url={value} shape={shape} busy={busy} progress={progress} />

        <div className="min-w-0 flex-1">
          <button
            id={fieldId}
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-line bg-ink px-3 py-2 text-sm font-medium text-chalk transition-colors hover:border-ash/50 disabled:cursor-not-allowed disabled:text-ash"
          >
            {busy ? `Lädt … ${progress} %` : value ? "Anderes Bild" : "Bild auswählen"}
          </button>

          <p className="mt-2 text-xs leading-snug text-ash">
            {message ? (
              <span role="alert" className="text-ember">
                {message}
              </span>
            ) : saved ? (
              // Die Zahl steht da, weil sie die Arbeit sichtbar macht, die
              // sonst niemand bemerkt — und weil sie erklärt, warum die Seite
              // schnell ist.
              <span className="text-signal">
                Fertig — {formatBytes(saved.originalBytes)} auf {formatBytes(saved.bytes)} gebracht.
              </span>
            ) : (
              hint
            )}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
        className="sr-only"
        // `sr-only` statt `hidden`: ein verstecktes Feld ist für die Tastatur
        // nicht erreichbar, und dann bliebe der Dialog nur per Maus offen.
        onChange={(event) => pick(event.target.files)}
      />
    </div>
  );
}

function Preview({
  url,
  shape,
  busy,
  progress,
}: {
  url: string;
  shape: "circle" | "square" | "wide";
  busy: boolean;
  progress: number;
}) {
  // Die Vorschau hat die Form, die das Bild spaeter hat. Ein rundes Kaestchen
  // fuer ein eckiges Vorschaubild waere eine Zusage, die die Seite bricht.
  const frame =
    shape === "circle" ? "size-16 rounded-full"
    : shape === "square" ? "size-16 rounded-lg"
    : "h-16 w-28 rounded-lg";

  return (
    <div className={`relative shrink-0 overflow-hidden border border-line bg-ink ${frame}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Bilder liegen im
        // eigenen Bucket bzw. auf fremden Hosts; der Optimizer ist aus.
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-ash" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <circle cx="8.5" cy="10" r="1.5" />
            <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}

      {busy && (
        <div className="absolute inset-0 flex items-end bg-ink/70">
          {/* Ein Balken am unteren Rand statt eines Spinners: er sagt, WIE WEIT
              es ist, nicht nur, dass etwas läuft. */}
          <div
            className="h-1 bg-signal transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`.replace(".", ",");
}
