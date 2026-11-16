"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

interface DataPrivacySettingsProps {
  email: string;
  labels: {
    exportButton: string;
    deleteButton: string;
    deleteHint: string;
    confirmationLabel: string;
    passwordLabel: string;
    deleting: string;
    failed: string;
    blockedOwned: string;
    blockedPending: string;
    invalidPassword: string;
  };
}

type FieldError = { field: "confirmation" | "password" | "form"; message: string } | null;

/**
 * Datenexport und Kontolöschung. Der Löschknopf ist immer bedienbar; was
 * fehlt oder nicht stimmt, steht danach direkt am betroffenen Feld — ein
 * grauer, unerklärter Knopf hilft niemandem weiter.
 */
export function DataPrivacySettings({ email, labels }: DataPrivacySettingsProps) {
  const t = useTranslations("account");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FieldError>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fail(next: NonNullable<FieldError>) {
    setError(next);
    if (next.field === "confirmation") confirmationRef.current?.focus();
    else if (next.field === "password") passwordRef.current?.focus();
  }

  async function requestDeletion() {
    if (confirmation.trim().toLowerCase() !== email.toLowerCase()) {
      fail({
        field: "confirmation",
        message: confirmation.trim()
          ? t("privacyConfirmationMismatch")
          : t("privacyConfirmationRequired"),
      });
      return;
    }
    if (!password) {
      fail({ field: "password", message: t("privacyPasswordRequired") });
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        if (body.error === "invalid-password") {
          fail({ field: "password", message: labels.invalidPassword });
        } else if (body.error === "confirmation-mismatch") {
          fail({ field: "confirmation", message: t("privacyConfirmationMismatch") });
        } else {
          fail({
            field: "form",
            message:
              body.error === "owned-communities-must-be-deleted-first"
                ? labels.blockedOwned
                : body.error === "pending-payments-or-reservations"
                  ? labels.blockedPending
                  : body.error === "too-many-attempts"
                    ? t("privacyTooManyAttempts")
                    : labels.failed,
          });
        }
        return;
      }
      window.location.assign("/");
    } catch {
      fail({ field: "form", message: labels.failed });
    } finally {
      setPending(false);
    }
  }

  const fieldClass =
    "mt-1.5 min-h-11 w-full rounded-lg border bg-white px-3 text-sm text-[#161613] outline-none focus:border-red-600 focus-visible:ring-2 focus-visible:ring-red-600";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-[#161613]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#161613]">{t("privacyExportTitle")}</p>
          <p className="mt-0.5 text-sm leading-6 text-[#161613]/70">{t("privacyExportText")}</p>
        </div>
        <a
          href="/api/account/export"
          download
          className="inline-flex min-h-10 shrink-0 items-center self-start rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2 sm:self-center"
        >
          {labels.exportButton}
        </a>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
        <p className="text-sm font-semibold text-red-800">{t("privacyDeleteTitle")}</p>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-red-950/80">{labels.deleteHint}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="account-delete-confirmation" className="block text-xs font-semibold text-red-950">
              {labels.confirmationLabel}
            </label>
            <input
              ref={confirmationRef}
              id="account-delete-confirmation"
              type="email"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                if (error?.field === "confirmation") setError(null);
              }}
              autoComplete="off"
              aria-invalid={error?.field === "confirmation" ? true : undefined}
              aria-describedby={error?.field === "confirmation" ? "account-delete-confirmation-error" : undefined}
              className={`${fieldClass} ${error?.field === "confirmation" ? "border-red-600" : "border-red-200"}`}
            />
            {error?.field === "confirmation" && (
              <p id="account-delete-confirmation-error" role="alert" className="mt-1.5 text-sm font-medium text-red-700">
                {error.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="account-delete-password" className="block text-xs font-semibold text-red-950">
              {labels.passwordLabel}
            </label>
            <input
              ref={passwordRef}
              id="account-delete-password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error?.field === "password") setError(null);
              }}
              autoComplete="current-password"
              aria-invalid={error?.field === "password" ? true : undefined}
              aria-describedby={error?.field === "password" ? "account-delete-password-error" : undefined}
              className={`${fieldClass} ${error?.field === "password" ? "border-red-600" : "border-red-200"}`}
            />
            {error?.field === "password" && (
              <p id="account-delete-password-error" role="alert" className="mt-1.5 text-sm font-medium text-red-700">
                {error.message}
              </p>
            )}
          </div>
        </div>
        {error?.field === "form" && (
          <p id="account-delete-error" role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error.message}
          </p>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={requestDeletion}
          className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-red-700 px-5 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? labels.deleting : labels.deleteButton}
        </button>
      </div>
    </div>
  );
}
