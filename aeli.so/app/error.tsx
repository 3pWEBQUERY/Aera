"use client";

import { useEffect } from "react";

/**
 * Der Auffangbehälter.
 *
 * Was hier NICHT steht: die Fehlermeldung. Sie enthält im Zweifel interne
 * Pfade oder Datenbanktexte, und für die Person davor ändert sie nichts. Was
 * stattdessen dasteht, ist die Kennung des Fehlers — damit ein Hinweis an den
 * Support etwas wert ist.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[aeli]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Da ist etwas schiefgegangen</h1>
      <p className="mt-2 max-w-sm text-sm text-ash">
        Nicht deine Schuld. Versuch es noch einmal — bleibt es dabei, schreib uns.
      </p>

      <div className="mt-8 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-xl bg-signal px-5 text-sm font-semibold text-ink transition-colors hover:bg-signal-deep"
        >
          Nochmal versuchen
        </button>
        {/* Bewusst ein <a> und kein <Link>: hier ist der React-Baum gerade
            kaputtgegangen. Eine weiche Navigation würde in denselben Zustand
            hinein rendern; ein echter Seitenaufruf ist der verlässliche
            Ausweg. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="inline-flex h-11 items-center rounded-xl border border-line px-5 text-sm font-medium text-chalk transition-colors hover:border-ash/50"
        >
          Zur Startseite
        </a>
      </div>

      {error.digest && <p className="mt-6 font-mono text-xs text-ash">Kennung: {error.digest}</p>}
    </div>
  );
}
