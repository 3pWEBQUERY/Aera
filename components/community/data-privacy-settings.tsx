"use client";

import { useState } from "react";

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

export function DataPrivacySettings({ email, labels }: DataPrivacySettingsProps) {
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function requestDeletion() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message =
          body.error === "owned-communities-must-be-deleted-first"
            ? labels.blockedOwned
            : body.error === "pending-payments-or-reservations"
              ? labels.blockedPending
              : body.error === "invalid-password"
                ? labels.invalidPassword
                : labels.failed;
        setError(message);
        return;
      }
      window.location.assign("/");
    } catch {
      setError(labels.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="rounded-xl bg-[#161613]/[0.035] p-4">
        <a
          href="/api/account/export"
          download
          className="inline-flex min-h-10 items-center rounded-full bg-[#161613] px-5 text-sm font-semibold text-white transition hover:bg-[#33332e]"
        >
          {labels.exportButton}
        </a>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
        <p className="text-sm leading-6 text-red-900/70">{labels.deleteHint}</p>
        <label className="mt-3 block text-xs font-semibold text-red-950">
          {labels.confirmationLabel}
          <input
            id="account-delete-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            placeholder={email}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "account-delete-error" : undefined}
            className="mt-1.5 min-h-10 w-full rounded-lg border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-500 focus-visible:ring-2 focus-visible:ring-red-600"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold text-red-950">
          {labels.passwordLabel}
          <input
            id="account-delete-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "account-delete-error" : undefined}
            className="mt-1.5 min-h-10 w-full rounded-lg border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-500 focus-visible:ring-2 focus-visible:ring-red-600"
          />
        </label>
        {error && (
          <p
            id="account-delete-error"
            role="alert"
            aria-live="assertive"
            className="mt-3 text-sm font-medium text-red-700"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={
            pending ||
            !password ||
            confirmation.trim().toLowerCase() !== email.toLowerCase()
          }
          onClick={requestDeletion}
          className="mt-4 inline-flex min-h-10 items-center rounded-full bg-red-700 px-5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? labels.deleting : labels.deleteButton}
        </button>
      </div>
    </div>
  );
}
