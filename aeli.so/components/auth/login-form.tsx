"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/app/actions/auth";
import { EMPTY_STATE } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? "Einen Moment…" : label}
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, EMPTY_STATE);
  // Der Server entscheidet, ob ein zweiter Faktor fehlt. Das Formular merkt es
  // sich nicht selbst — sonst zeigt ein Zurück-Klick eine Code-Abfrage für
  // eine Anmeldung, die es nicht mehr gibt.
  const needsTotp = state.data?.needsTotp === true;

  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      <input type="hidden" name="weiter" value={next} />

      {state.error && (
        <p role="alert" className="rounded-xl border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember">
          {state.error}
        </p>
      )}
      {state.notice && !state.error && (
        <p className="rounded-xl border border-line bg-ink-2 px-4 py-3 text-sm text-ash">{state.notice}</p>
      )}

      <Field id="email" label="E-Mail-Adresse">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={typeof state.data?.email === "string" ? state.data.email : ""}
          readOnly={needsTotp}
          placeholder="du@example.com"
        />
      </Field>

      <Field id="password" label="Passwort">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>

      {needsTotp && (
        <Field
          id="totp"
          label="Code aus deiner App"
          hint="Sechs Ziffern, wechselt alle 30 Sekunden."
        >
          <Input
            id="totp"
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            // Der Fokus gehört hierhin, sobald das Feld erscheint — sonst
            // tippt man den Code ins Passwortfeld darüber.
            autoFocus
            maxLength={6}
            pattern="\d{6}"
            required
            className="tracking-[0.5em] font-mono"
          />
        </Field>
      )}

      <Submit label="Anmelden" />
    </form>
  );
}
