"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";

/**
 * Fehler eines Upload-Felds, direkt am Feld.
 *
 * Die Upload-Anzeige oben rechts zeigt nur Fortschritt; was schiefging und
 * wie es weitergeht, steht hier: der Satz aus `useUploadErrorText` und
 * „Erneut hochladen“ mit denselben Dateien, ohne sie neu auswaehlen zu
 * muessen. `role="alert"` liest den Fehler sofort vor.
 */
export function UploadFieldError({
  message,
  onRetry,
  retrying,
  id,
}: {
  message: string | null;
  onRetry?: () => void;
  retrying?: boolean;
  id?: string;
}) {
  const t = useTranslations("uploads");
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="shrink-0 rounded-md px-1 font-semibold text-red-800 underline underline-offset-2 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60"
        >
          {t("retry")}
        </button>
      )}
    </div>
  );
}
