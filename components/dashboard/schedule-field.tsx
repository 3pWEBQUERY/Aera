"use client";

import { useState } from "react";
import { Input } from "@/components/ui/field";

/**
 * Termin-Feld fuer die Composer.
 *
 * `datetime-local` liefert eine Wanduhrzeit ohne Zeitzone ("2026-07-26T15:00").
 * Der Server hat das bisher mit `new Date(...)` gelesen und damit in *seiner*
 * Zone interpretiert — auf Railway UTC. Fuer einen Creator in Mitteleuropa
 * wanderte jeder Termin dadurch zwei Stunden nach hinten: "jetzt" wurde zur
 * Zukunft, der Beitrag galt als geplant und blieb unveroeffentlicht.
 *
 * Deshalb rechnet der Browser hier selbst in einen echten Zeitpunkt um und
 * schickt den mit; das sichtbare Feld bleibt Wanduhrzeit.
 */
export function ScheduleField({
  id,
  name = "scheduledAt",
  defaultValue,
}: {
  id?: string;
  name?: string;
  defaultValue?: string;
}) {
  const [local, setLocal] = useState(defaultValue ?? "");
  const iso = local ? new Date(local).toISOString() : "";
  return (
    <>
      <Input
        id={id}
        type="datetime-local"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}
