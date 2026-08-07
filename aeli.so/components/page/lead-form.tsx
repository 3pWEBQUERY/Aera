"use client";

import { useState } from "react";
import type { PageMode } from "./types";

/**
 * Newsletter- und Kontaktformular auf der öffentlichen Seite.
 *
 * Bewusst kein Server-Action-Formular: die Seite ist statisch cachebar und
 * soll es bleiben. Ein `fetch` auf eine schmale Route hält den Rest der Seite
 * unberührt — und beim Absenden bleibt man dort, wo man war, statt eine
 * Navigation zu erleben.
 */
export function LeadForm({
  profileId,
  blockId,
  source,
  mode,
  withMessage,
  buttonLabel,
  successMessage,
  strings,
}: {
  profileId: string;
  blockId: string;
  source: "NEWSLETTER" | "CONTACT";
  mode: PageMode;
  withMessage: boolean;
  buttonLabel: string;
  successMessage: string;
  strings: { namePlaceholder: string; messagePlaceholder: string; newsletterPlaceholder: string; genericError: string; invalidEmail: string };
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (state === "done") {
    return (
      <p className="aeli-surface px-4 py-3.5 text-sm" role="status">
        {successMessage}
      </p>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "preview") return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setState("error");
      setMessage(strings.invalidEmail);
      return;
    }

    setState("sending");
    setMessage(null);
    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId,
          blockId,
          source,
          email,
          name: String(form.get("name") ?? "").trim() || undefined,
          message: String(form.get("message") ?? "").trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("done");
    } catch {
      setState("error");
      setMessage(strings.genericError);
    }
  }

  const fieldClass =
    "w-full rounded-[calc(var(--aeli-radius)*0.6)] border border-[var(--aeli-border)] " +
    "bg-[var(--aeli-surface)] px-3.5 py-2.5 text-sm text-[var(--aeli-fg)] " +
    "placeholder:text-[var(--aeli-muted)] focus:outline-none focus:ring-2 " +
    "focus:ring-[color-mix(in_oklab,var(--aeli-accent)_45%,transparent)]";

  return (
    <form onSubmit={onSubmit} className="space-y-2.5">
      {source === "CONTACT" && (
        <input name="name" placeholder={strings.namePlaceholder} className={fieldClass} autoComplete="name" />
      )}
      <input
        name="email"
        type="email"
        required
        placeholder={strings.newsletterPlaceholder}
        className={fieldClass}
        autoComplete="email"
        aria-invalid={state === "error"}
      />
      {withMessage && (
        <textarea
          name="message"
          rows={3}
          placeholder={strings.messagePlaceholder}
          className={`${fieldClass} resize-y`}
        />
      )}
      <button
        type="submit"
        disabled={state === "sending" || mode === "preview"}
        className="aeli-link aeli-btn-solid justify-center disabled:opacity-70"
      >
        {state === "sending" ? "…" : buttonLabel}
      </button>
      {message && (
        <p role="alert" className="text-xs text-[var(--aeli-muted)]">
          {message}
        </p>
      )}
    </form>
  );
}
