"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useModalAccessibility } from "./use-modal-accessibility";

export interface ConfirmOptions {
  /** Frage, die Objekt und Folge nennt: „„Sommerkurs“ endgültig löschen?“ */
  title: string;
  /** Optional: was danach passiert bzw. nicht mehr geht. */
  body?: ReactNode;
  /** Verb + Nomen, z. B. „Endgültig löschen“, „Jetzt an 120 senden“. */
  confirmLabel: string;
  /** Standard „Abbrechen“. */
  cancelLabel?: string;
  /** "danger" für Unumkehrbares (rot), sonst die normale Hauptaktion. */
  tone?: "danger" | "default";
}

/**
 * Bestätigung vor unumkehrbaren Aktionen, als Ersatz für `window.confirm()`.
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title, confirmLabel, tone: "danger" }))) return;
 *   …
 *   return <>{…}{confirmDialog}</>;
 *
 * Der Fokus startet auf „Abbrechen“: Wer nur Enter drückt, behält seine Daten.
 * Escape und ein Klick daneben brechen ab; danach kehrt der Fokus zum
 * auslösenden Element zurück (useModalAccessibility).
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  const dialog = options ? <ConfirmDialog options={options} onSettle={settle} /> : null;
  return [confirm, dialog];
}

function ConfirmDialog({
  options,
  onSettle,
}: {
  options: ConfirmOptions;
  onSettle: (value: boolean) => void;
}) {
  const t = useTranslations("common");
  const titleId = useId();
  const bodyId = useId();
  const ref = useModalAccessibility<HTMLDivElement>({ open: true, onClose: () => onSettle(false) });
  const danger = options.tone === "danger";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <div aria-hidden className="absolute inset-0 bg-slate-900/40" onClick={() => onSettle(false)} />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.body ? bodyId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl focus:outline-none"
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          {options.title}
        </h2>
        {options.body && (
          <div id={bodyId} className="mt-2 text-sm leading-relaxed text-slate-600">
            {options.body}
          </div>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            autoFocus
            onClick={() => onSettle(false)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          >
            {options.cancelLabel ?? t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => onSettle(true)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              danger
                ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
                : "bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-[var(--primary-hover)] focus-visible:ring-[var(--brand-ring)]",
            )}
          >
            {options.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
