"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { normalizeHandle } from "@/lib/handle";

/**
 * Das Feld im Hero.
 *
 * Es prüft bewusst NICHT, ob der Handle frei ist: die Verfügbarkeitsabfrage
 * verlangt eine Anmeldung, sonst wäre sie ein bequemes Werkzeug, um die
 * gesamte Handle-Liste abzugrasen. Was es leistet, ist die eine Sache, die
 * jemanden hierher gebracht hat — er sieht seine Adresse, bevor er ein Konto
 * anlegt.
 */
export function HandleGrab({ suffix }: { suffix: string }) {
  const [handle, setHandle] = useState("");
  const router = useRouter();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        router.push(handle ? `/signup?h=${encodeURIComponent(handle)}` : "/signup");
      }}
      className="flex w-full max-w-lg flex-col gap-2.5 sm:flex-row"
    >
      <div className="flex flex-1 items-center rounded-2xl border border-line bg-ink-2 px-4 transition-colors focus-within:border-signal">
        <label htmlFor="hero-handle" className="sr-only">
          Wunsch-Handle
        </label>
        <input
          id="hero-handle"
          value={handle}
          onChange={(event) => setHandle(normalizeHandle(event.target.value))}
          placeholder="deinname"
          autoComplete="off"
          spellCheck={false}
          maxLength={30}
          className="min-w-0 flex-1 bg-transparent py-3.5 text-base font-semibold text-chalk placeholder:text-ash/60 focus:outline-none"
        />
        <span className="shrink-0 text-base text-ash">.{suffix}</span>
      </div>

      <button
        type="submit"
        className="h-[3.4rem] shrink-0 rounded-2xl bg-signal px-6 text-sm font-semibold text-ink transition-colors hover:bg-signal-deep"
      >
        Handle sichern
      </button>
    </form>
  );
}
