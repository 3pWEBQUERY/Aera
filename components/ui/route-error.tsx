"use client";

import Link from "next/link";
import { useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

/**
 * Inhalt aller `error.tsx`-Grenzen.
 *
 * „Neu laden“ ruft `retry()` (Next 16): holt die Daten des Segments neu vom
 * Server und rendert es dann noch einmal. Das fruehere `reset()` allein
 * renderte nur den alten, kaputten Stand erneut und schickte keine einzige
 * Anfrage — der Knopf tat sichtbar nichts.
 *
 * `fullscreen` nur fuer die oberste Grenze; in Dashboard, Community und Admin
 * bleibt das Layout mit Navigation stehen, der Fehler sitzt im Inhaltsbereich.
 */
export function RouteError({
  error,
  retry,
  title,
  link,
  fullscreen = false,
}: {
  error: unknown;
  retry: () => void;
  /** Ueberschrift; Standard: „Die Seite konnte nicht geladen werden“. */
  title?: string;
  /** Zweiter Weg hinaus; Standard: die Hilfe. */
  link?: { href: string; label: string };
  fullscreen?: boolean;
}) {
  const t = useTranslations("ui.state");
  const [pending, startRetry] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;
  const exit = link ?? { href: "/hilfe", label: t("toHelp") };

  return (
    <div
      className={cn(
        "flex items-center justify-center px-4",
        fullscreen ? "min-h-screen bg-slate-50" : "py-16 sm:py-24",
      )}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700"
        >
          <Icon name="alert" size={24} />
        </span>
        <div role="alert">
          <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
            {title ?? t("pageErrorTitle")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t("pageErrorText")}</p>
        </div>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => startRetry(() => retry())}
            disabled={pending}
            aria-busy={pending || undefined}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
          >
            <Icon name="refresh" size={16} className={pending ? "animate-spin" : undefined} />
            {t("reload")}
          </button>
          <Link
            href={exit.href}
            className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {exit.label}
          </Link>
        </div>
        {digest && (
          <p className="mt-6 font-mono text-xs text-slate-500">{t("errorRef", { digest })}</p>
        )}
      </div>
    </div>
  );
}
