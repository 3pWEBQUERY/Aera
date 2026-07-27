"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/dashboard/icons";
import {
  dismissUpload,
  subscribeUploads,
  type UploadJob,
} from "@/lib/upload-progress";
import { cn } from "@/lib/utils";

/**
 * Anzeige laufender Uploads, unten rechts.
 *
 * Sitzt einmal im Wurzel-Layout und hoert am Upload-Speicher; jede
 * Upload-Oberflaeche der App bekommt sie damit ohne eigenes Zutun. Mehrere
 * Dateien stehen als eigene Karten uebereinander — ein zusammengefasster
 * Balken verbirgt gerade das, was man wissen will: welche Datei haengt.
 *
 * Die Anzeige nimmt keine Klicks weg (`pointer-events-none` auf dem Stapel,
 * nur die Karten selbst sind anfassbar), damit sie die Seite darunter nicht
 * blockiert.
 */

/** Mehr als das passt nicht auf einen Handy-Bildschirm. */
const MAX_VISIBLE = 4;

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

  if (jobs.length === 0) return null;

  // Neueste unten: der Blick wandert beim Hinzufuegen nicht nach oben weg.
  const visible = jobs.slice(-MAX_VISIBLE);
  const hidden = jobs.length - visible.length;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5"
    >
      {hidden > 0 && (
        <p className="pointer-events-auto rounded-full bg-[#161613]/85 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
          {t("more", { count: hidden })}
        </p>
      )}
      {visible.map((job) => (
        <UploadCard key={job.id} job={job} t={t} />
      ))}
    </div>
  );
}

function UploadCard({
  job,
  t,
}: {
  job: UploadJob;
  t: ReturnType<typeof useTranslations<"uploads">>;
}) {
  const failed = job.phase === "error";
  const done = job.phase === "done";
  const verifying = job.phase === "verifying";

  const status = failed
    ? (job.error ?? t("failed"))
    : done
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
      className={cn(
        "upload-card-in pointer-events-auto w-full overflow-hidden rounded-2xl bg-white p-3 ring-1 sm:w-[21rem]",
        "shadow-[var(--shadow-card-lg)]",
        failed ? "ring-red-200" : "ring-[#161613]/10",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl",
            failed ? "bg-red-50 text-red-500" : "bg-[var(--action-soft)] text-[#161613]/60",
          )}
        >
          {job.previewUrl && !failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name={failed ? "alert" : iconFor(job)} size={18} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#161613]">
              {job.name}
            </p>
            {done ? (
              <Icon name="check" size={16} className="shrink-0 text-emerald-600" />
            ) : (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-[#161613]/45">
                {failed ? "" : `${job.percent}%`}
              </span>
            )}
          </div>

          <Bar job={job} />

          <p
            className={cn(
              "mt-1.5 truncate text-xs",
              failed ? "text-red-600" : "text-[#161613]/50",
            )}
          >
            {status}
          </p>
        </div>

        {(failed || done) && (
          <button
            type="button"
            onClick={() => dismissUpload(job.id)}
            aria-label={t("dismiss")}
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#161613]/40 transition hover:bg-[#161613]/5 hover:text-[#161613]"
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
  if (job.phase === "error") {
    return <div className="mt-1.5 h-1.5 w-full rounded-full bg-red-100" />;
  }
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
          job.phase === "done" ? "bg-emerald-500" : "bg-[var(--action-strong)]",
        )}
        style={{ width: `${Math.max(job.percent, 2)}%` }}
      />
    </div>
  );
}
