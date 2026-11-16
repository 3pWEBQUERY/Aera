"use client";

/**
 * Fortschritt aller laufenden Uploads — ein Speicher fuer die ganze App.
 *
 * Jeder Upload laeuft ueber `uploadMediaFile`, und dort meldet sich jeder
 * Auftrag hier an. Die Anzeige oben rechts (components/ui/upload-dock)
 * hoert zu. Dadurch muss keine der zwoelf Upload-Oberflaechen etwas davon
 * wissen: wer hochlaedt, wird gezeigt.
 *
 * Der Speicher kennt nur Fortschritt. Ein Fehler gehoert an das Feld, in dem
 * er passiert ist — dort steht auch „Erneut hochladen“. Fehlgeschlagene
 * Auftraege verlassen die Anzeige darum sofort; frueher blieben sie als Karte
 * stehen und lagen ueber den Speichern-Knoepfen der Sheets.
 *
 * Bewusst ohne Zustandsbibliothek — ein Set von Zuhoerern und ein Array
 * reichen. Der Speicher lebt im Browser-Modul, also so lange wie der Tab.
 */

export type UploadPhase = "preparing" | "uploading" | "verifying" | "done";

export interface UploadJob {
  id: string;
  name: string;
  sizeBytes: number;
  /** Vorschaubild fuer Bilder (Objekt-URL), sonst null. */
  previewUrl: string | null;
  phase: UploadPhase;
  /** 0–100. */
  percent: number;
  /** Geschaetzte Restzeit in Sekunden; null, solange nichts messbar ist. */
  secondsLeft: number | null;
  startedAt: number;
  endedAt?: number;
}

type Listener = (jobs: UploadJob[]) => void;

let jobs: UploadJob[] = [];
const listeners = new Set<Listener>();
let counter = 0;

/**
 * So lange bleibt die Erfolgskarte stehen. Die Anzeige haelt die Zeit an,
 * solange der Zeiger darauf liegt oder sie den Fokus hat (siehe upload-dock).
 */
export const DONE_VISIBLE_MS = 10_000;

function emit() {
  const snapshot = jobs.slice();
  listeners.forEach((l) => l(snapshot));
}

function patch(id: string, next: Partial<UploadJob>) {
  const i = jobs.findIndex((j) => j.id === id);
  if (i === -1) return;
  jobs = [...jobs.slice(0, i), { ...jobs[i], ...next }, ...jobs.slice(i + 1)];
  emit();
}

export function subscribeUploads(listener: Listener): () => void {
  listeners.add(listener);
  listener(jobs.slice());
  return () => {
    listeners.delete(listener);
  };
}

export function getUploads(): UploadJob[] {
  return jobs.slice();
}

export function dismissUpload(id: string) {
  const job = jobs.find((j) => j.id === id);
  if (job?.previewUrl) URL.revokeObjectURL(job.previewUrl);
  jobs = jobs.filter((j) => j.id !== id);
  emit();
}

export interface UploadHandle {
  setPhase(phase: Exclude<UploadPhase, "done">): void;
  setPercent(percent: number): void;
  done(): void;
  /** Nimmt den Auftrag aus der Anzeige; den Fehler zeigt das Upload-Feld. */
  fail(): void;
}

/**
 * Meldet einen Upload an und liefert die Griffe, um ihn fortzuschreiben.
 *
 * Die Restzeit entsteht aus einem gleitenden Mittel der Uebertragungsrate:
 * eine reine Momentaufnahme springt bei jedem Netzwerkhuepfer, ein reiner
 * Durchschnitt reagiert am Ende nicht mehr. 0,3 gewichtet den neuen Messwert
 * genug, um einen Abbruch der Leitung zu zeigen, ohne zu zappeln.
 */
export function beginUpload(file: File): UploadHandle {
  const id = `up_${++counter}_${file.size}`;
  const isImage = file.type.startsWith("image/");
  const job: UploadJob = {
    id,
    name: file.name,
    sizeBytes: file.size,
    previewUrl: isImage ? URL.createObjectURL(file) : null,
    phase: "preparing",
    percent: 0,
    secondsLeft: null,
    startedAt: Date.now(),
  };
  jobs = [...jobs, job];
  emit();

  let lastAt = Date.now();
  let lastBytes = 0;
  let rate = 0; // Bytes pro Sekunde, geglaettet

  return {
    setPhase(phase) {
      patch(id, { phase });
    },
    setPercent(percent) {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      const now = Date.now();
      const bytes = (p / 100) * file.size;
      const dt = (now - lastAt) / 1000;
      // Unter 150 ms ist die Messung Rauschen, darum nicht neu schaetzen.
      if (dt >= 0.15 && bytes > lastBytes) {
        const sample = (bytes - lastBytes) / dt;
        rate = rate === 0 ? sample : rate * 0.7 + sample * 0.3;
        lastAt = now;
        lastBytes = bytes;
      }
      const remaining = file.size - bytes;
      patch(id, {
        percent: p,
        phase: "uploading",
        secondsLeft: rate > 0 && remaining > 0 ? Math.ceil(remaining / rate) : null,
      });
    },
    done() {
      // Das Ausblenden steuert die Karte selbst (Pause bei Hover/Fokus).
      patch(id, { phase: "done", percent: 100, secondsLeft: 0, endedAt: Date.now() });
    },
    fail() {
      dismissUpload(id);
    },
  };
}
