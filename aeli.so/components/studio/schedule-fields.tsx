"use client";

import { useId, useState } from "react";

/**
 * Start- und Endzeitpunkt eines Blocks.
 *
 * `datetime-local` liefert Ortszeit ohne Zonenangabe („2026-08-07T14:30“). Auf
 * einem UTC-Server gelesen wäre das je nach Jahreszeit ein bis zwei Stunden
 * neben dem, was der Creator gemeint hat — und zwar still, ohne Fehler.
 *
 * Deshalb rechnet der Browser hier um: sichtbar bleibt die Ortszeit, gesendet
 * wird der absolute Zeitpunkt in einem versteckten Feld. Die Action verwirft
 * alles ohne Zone (siehe app/actions/profile.ts).
 */
export function ScheduleFields({
  startsAt,
  endsAt,
}: {
  startsAt: string | null;
  endsAt: string | null;
}) {
  const [start, setStart] = useState(() => toLocalInput(startsAt));
  const [end, setEnd] = useState(() => toLocalInput(endsAt));
  const startId = useId();
  const endId = useId();

  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-xs font-medium text-ash">
        Zeitfenster — außerhalb ist der Block unsichtbar, ohne dass du ihn löschen musst.
      </legend>

      <div className="space-y-1.5">
        <label htmlFor={startId} className="text-xs text-ash">
          Ab
        </label>
        <input
          id={startId}
          type="datetime-local"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          className="w-full rounded-lg border border-line bg-ink-2 px-3 py-2 text-sm text-chalk [color-scheme:dark] focus:border-signal focus:outline-none"
        />
        <input type="hidden" name="startsAt" value={toIso(start)} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={endId} className="text-xs text-ash">
          Bis
        </label>
        <input
          id={endId}
          type="datetime-local"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          className="w-full rounded-lg border border-line bg-ink-2 px-3 py-2 text-sm text-chalk [color-scheme:dark] focus:border-signal focus:outline-none"
        />
        <input type="hidden" name="endsAt" value={toIso(end)} />
      </div>
    </fieldset>
  );
}

/** ISO (UTC) → „YYYY-MM-DDTHH:mm“ in Ortszeit, wie `datetime-local` es erwartet. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Ortszeit-Eingabe → absoluter Zeitpunkt mit Zone. */
function toIso(local: string): string {
  if (!local) return "";
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
