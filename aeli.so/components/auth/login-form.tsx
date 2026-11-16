"use client";

import { useActionState, useState } from "react";
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

export function LoginForm({ next, resetUrl }: { next: string; resetUrl: string }) {
  const [state, action] = useActionState(loginAction, EMPTY_STATE);
  // E-Mail und Passwort sind kontrolliert: React setzt ein Formular nach
  // jeder Action zurück, und ohne eigenen Zustand wäre das Passwort genau dann
  // weg, wenn der Server nach dem zweiten Faktor fragt.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Der Server entscheidet, ob ein zweiter Faktor fehlt. Das Formular merkt es
  // sich nicht selbst — sonst zeigt ein Zurück-Klick eine Code-Abfrage für
  // eine Anmeldung, die es nicht mehr gibt.
  const needsTotp = state.data?.needsTotp === true;
  const totpError = state.fieldErrors?.totp;

  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      <input type="hidden" name="weiter" value={next} />

      {state.error && (
        <p role="alert" className="rounded-xl border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember">
          {state.error}
        </p>
      )}

      <Field id="email" label="E-Mail-Adresse">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          readOnly={needsTotp}
          placeholder="du@example.com"
        />
      </Field>

      {needsTotp ? (
        <>
          {/* Das Passwort ist schon geprüft; es reist versteckt mit, damit der
              zweite Schritt nicht noch einmal danach fragt. */}
          <input type="hidden" name="password" value={password} />
          <Field
            id="totp"
            label="Code aus deiner Authenticator-App"
            hint={
              <>
                Gib den Code aus deiner Authenticator-App ein. Ohne App geht auch einer deiner
                Wiederherstellungscodes (z.&nbsp;B. abcd-2345-efgh); er gilt nur einmal.
              </>
            }
            error={totpError}
          >
            <Input
              id="totp"
              name="totp"
              autoComplete="one-time-code"
              // Der Fokus gehört hierhin, sobald das Feld erscheint — sonst
              // tippt man den Code ins Feld darüber.
              autoFocus
              autoCapitalize="none"
              spellCheck={false}
              // 6 Ziffern oder ein Wiederherstellungscode mit Trennstrichen.
              maxLength={20}
              required
              aria-invalid={totpError ? true : undefined}
              aria-describedby="totp-note"
              className="font-mono tracking-[0.2em]"
            />
          </Field>
        </>
      ) : (
        <Field
          id="password"
          label="Passwort"
          hint={
            <a
              href={resetUrl}
              className="font-medium text-chalk underline underline-offset-4"
            >
              Passwort vergessen?
            </a>
          }
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
      )}

      <Submit label={needsTotp ? "Bestätigen" : "Anmelden"} />
    </form>
  );
}
