"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { unlockAction } from "@/app/actions/gate";
import { EMPTY_STATE } from "@/lib/action-state";
import { themeStyleVars, type ResolvedTheme } from "@/lib/themes";
import type { PublicStrings } from "@/lib/public-strings";
import type { AeliGate } from "@/app/generated/prisma/client";

/**
 * Die Tür vor der Seite.
 *
 * Sie trägt bereits das Theme des Profils — wer hier landet, soll sehen, wo er
 * ist, und nicht auf einer neutralen Systemseite stehen. Gezeigt wird nur
 * Name und Avatar; die Blöcke dahinter kommen erst nach dem Entsperren aus der
 * Datenbank, nicht etwa versteckt im HTML.
 */
export function GateScreen({
  profileId,
  gate,
  displayName,
  avatarUrl,
  theme,
  strings,
}: {
  profileId: string;
  gate: Exclude<AeliGate, "NONE">;
  displayName: string;
  avatarUrl: string | null;
  theme: ResolvedTheme;
  strings: PublicStrings;
}) {
  const [state, action] = useActionState(unlockAction, EMPTY_STATE);

  const copy = {
    PASSWORD: {
      title: strings.gatePasswordTitle,
      hint: strings.gatePasswordHint,
      placeholder: strings.gatePasswordPlaceholder,
      type: "password" as const,
      autoComplete: "off",
    },
    EMAIL: {
      title: strings.gateEmailTitle,
      hint: strings.gateEmailHint,
      placeholder: strings.newsletterPlaceholder,
      type: "email" as const,
      autoComplete: "email",
    },
    AGE: {
      title: strings.gateAgeTitle,
      hint: strings.gateAgeHint,
      placeholder: "",
      type: "hidden" as const,
      autoComplete: "off",
    },
  }[gate];

  return (
    <div
      className="aeli-page flex min-h-dvh items-center justify-center px-5"
      style={themeStyleVars(theme) as React.CSSProperties}
    >
      <div className="aeli-surface w-full max-w-sm p-7 text-center">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="mx-auto size-16 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="aeli-display mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--aeli-accent)] text-2xl font-semibold text-[var(--aeli-accent-fg)]"
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}

        <h1 className="aeli-display mt-4 text-lg font-semibold">{copy.title}</h1>
        <p className="mt-1.5 text-sm opacity-70">{copy.hint}</p>

        <form action={action} className="mt-5 space-y-3">
          <input type="hidden" name="profileId" value={profileId} />

          {gate === "AGE" ? (
            <>
              <input type="hidden" name="answer" value="ja" />
              <UnlockButton label={strings.gateAgeYes} />
              <a
                href="https://www.google.com"
                className="block text-xs underline underline-offset-4 opacity-60"
              >
                {strings.gateAgeNo}
              </a>
            </>
          ) : (
            <>
              <label htmlFor="gate-answer" className="sr-only">
                {copy.placeholder}
              </label>
              <input
                id="gate-answer"
                name="answer"
                type={copy.type}
                autoComplete={copy.autoComplete}
                required
                autoFocus
                placeholder={copy.placeholder}
                aria-invalid={Boolean(state.error)}
                className="w-full rounded-[calc(var(--aeli-radius)*0.6)] border border-[var(--aeli-border)] bg-[var(--aeli-bg)] px-3.5 py-2.5 text-center text-sm text-[var(--aeli-fg)] placeholder:text-[var(--aeli-muted)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--aeli-accent)_45%,transparent)]"
              />
              <UnlockButton label={strings.gateUnlock} />
            </>
          )}

          {state.error && (
            <p role="alert" className="text-xs text-[var(--aeli-accent)]">
              {state.error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

function UnlockButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="aeli-link aeli-btn-solid justify-center disabled:opacity-70"
    >
      {pending ? "…" : label}
    </button>
  );
}
