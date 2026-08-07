import type { ComponentProps, ReactNode } from "react";

/**
 * Formularfelder mit Label, Hinweis und Fehler an einer Stelle.
 *
 * Der Grund für das Bündel ist die Zuordnung: `htmlFor`, `aria-describedby`
 * und `aria-invalid` müssen zusammenpassen, sonst liest ein Screenreader das
 * Feld ohne seinen Fehler vor. Über verstreute Aufrufe hält das niemand
 * dauerhaft konsistent.
 */

export const inputClass =
  "w-full rounded-xl border border-line bg-ink-2 px-3.5 py-2.5 text-sm text-chalk " +
  "placeholder:text-ash/70 transition-colors " +
  "hover:border-ash/40 focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/30 " +
  "disabled:cursor-not-allowed disabled:text-ash " +
  "aria-[invalid=true]:border-ember aria-[invalid=true]:ring-ember/25";

export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm font-medium text-chalk">
        {label}
        {optional && <span className="text-xs font-normal text-ash">optional</span>}
      </label>
      {children}
      {/* Hinweis und Fehler teilen sich die Zeile: der Fehler ersetzt den
          Hinweis, statt ihn nach unten zu schieben — sonst springt beim Tippen
          das halbe Formular. */}
      {error ? (
        <p id={`${id}-note`} role="alert" className="text-xs text-ember">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-note`} className="text-xs text-ash">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${className}`} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputClass} min-h-24 resize-y ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={`${inputClass} appearance-none bg-[length:11px] bg-[right_0.9rem_center] bg-no-repeat pr-9 ${className}`}
      style={{
        // Der Pfeil als data:-URL statt als Icon-Komponente: ein <select> kann
        // keine Kinder rendern, die keine <option> sind.
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%238f8f9c' stroke-width='1.6' stroke-linecap='round'/></svg>\")",
      }}
    />
  );
}
