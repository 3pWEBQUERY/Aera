"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/dashboard/icons";
import {
  DONE_VISIBLE_MS,
  dismissUpload,
  subscribeUploads,
  type UploadJob,
} from "@/lib/upload-progress";
import { cn } from "@/lib/utils";

/**
 * Anzeige laufender Uploads, oben rechts unter der Kopfzeile.
 *
 * Sitzt einmal im Wurzel-Layout und hoert am Upload-Speicher; jede
 * Upload-Oberflaeche der App bekommt sie damit ohne eigenes Zutun. Mehrere
 * Dateien stehen als eigene Karten untereinander — ein zusammengefasster
 * Balken verbirgt gerade das, was man wissen will: welche Datei haengt.
 *
 * Warum oben: Die Hauptaktionen der App („Beitrag erstellen“, „Speichern“)
 * stehen in der Fusszeile der Sheets, unten rechts. Dort lag die Anzeige
 * frueher und fing Klicks ab. Unter der Kopfzeile (Dashboard und Sheet sind
 * beide 4 rem hoch) liegt nur Inhalt, der sich wegscrollen laesst.
 *
 * Nur Fortschritt: Fehler zeigt das Upload-Feld selbst, mit „Erneut
 * hochladen“ (siehe lib/upload-progress). Erfolgskarten bleiben zehn
 * Sekunden stehen; solange Zeiger oder Fokus auf ihnen liegt, laeuft die Zeit
 * nicht weiter. Der Stapel selbst nimmt keine Klicks (`pointer-events-none`).
 */

/** Mehr als das passt nicht auf einen Handy-Bildschirm. */
const MAX_VISIBLE = 3;

function iconFor(job: UploadJob): IconName {
  if (job.name.match(/\.(mp4|mov|webm|mkv|m4v)$/i)) return "videos";
  if (job.name.match(/\.(mp3|m4a|wav|aac|ogg)$/i)) return "podcast";
  if (job.previewUrl) return "gallery";
  return "archive";
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function UploadDock() {
  const t = useTranslations("uploads");
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  useEffect(() => subscribeUploads(setJobs), []);

  // Fuer Screenreader nur der Abschluss — jeder Prozentschritt waere Laerm.
  const finished = jobs.filter((j) => j.phase === "done").map((j) => j.name);

  // Neueste oben, direkt unter der Kopfzeile.
  const visible = jobs.slice(-MAX_VISIBLE).reverse();
  const hidden = jobs.length - visible.length;

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {finished.length > 0 ? t("doneAnnounce", { names: finished.join(", ") }) : ""}
      </p>
      {jobs.length > 0 && (
        <div className="pointer-events-none fixed inset-x-3 top-[4.5rem] z-[65] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5">
          {visible.map((job) => (
            <UploadCard key={job.id} job={job} t={t} />
          ))}
          {hidden > 0 && (
            <p className="rounded-full bg-[#161613]/85 px-3 py-1 text-[11px] font-semibold text-white">
              {t("more", { count: hidden })}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function UploadCard({
  job,
  t,
}: {
  job: UploadJob;
  t: ReturnType<typeof useTranslations<"uploads">>;
}) {
  const done = job.phase === "done";
  const verifying = job.phase === "verifying";
  const [held, setHeld] = useState(false);
  const remaining = useRef(DONE_VISIBLE_MS);

  // Erfolgskarte: zehn Sekunden, angehalten bei Hover oder Fokus.
  useEffect(() => {
    if (!done || held) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => dismissUpload(job.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(1500, remaining.current - (Date.now() - startedAt));
    };
  }, [done, held, job.id]);

  const status = done
    ? t("done")
    : verifying
      ? t("verifying")
      : job.phase === "preparing"
        ? t("preparing")
        : job.secondsLeft === null
          ? formatSize(job.sizeBytes)
          : job.secondsLeft >= 60
            ? t("minutesLeft", { count: Math.ceil(job.secondsLeft / 60) })
            : t("secondsLeft", { count: Math.max(1, job.secondsLeft) });

  return (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={cn(
        "upload-card-in w-full overflow-hidden rounded-2xl bg-white p-3 ring-1 ring-[#161613]/10 sm:w-[20rem]",
        "shadow-[var(--shadow-card-lg)]",
        // Nur die fertige Karte hat etwas zum Anfassen (Ausblenden); laufende
        // Karten lassen Klicks zur Seite darunter durch.
        done ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--action-soft)] text-[#161613]/65">
          {job.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name={iconFor(job)} size={18} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#161613]">
              {job.name}
            </p>
            {done ? (
              <Icon name="check" size={16} className="shrink-0 text-emerald-700" />
            ) : (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-[#161613]/65">
                {`${job.percent}%`}
              </span>
            )}
          </div>

          <Bar job={job} />

          <p className="mt-1.5 truncate text-xs text-[#161613]/65">{status}</p>
        </div>

        {done && (
          <button
            type="button"
            onClick={() => dismissUpload(job.id)}
            aria-label={t("dismiss")}
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#161613]/65 transition hover:bg-[#161613]/5 hover:text-[#161613]"
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Der Balken. Beim Pruefen laeuft er als wandernder Streifen weiter — dort
 * kennt niemand den Fortschritt, aber Stillstand bei 100 % laese sich wie ein
 * Absturz.
 */
function Bar({ job }: { job: UploadJob }) {
  if (job.phase === "verifying") {
    return (
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#161613]/10">
        <div className="upload-sweep h-full w-1/3 rounded-full bg-[var(--action-strong)]" />
      </div>
    );
  }
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#161613]/10">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out",
          job.phase === "done" ? "bg-emerald-600" : "bg-[var(--action-strong)]",
        )}
        style={{ width: `${Math.max(job.percent, 2)}%` }}
      />
    </div>
  );
}
