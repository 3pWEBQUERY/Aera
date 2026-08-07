"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signupAction } from "@/app/actions/auth";
import { EMPTY_STATE } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? "Konto wird angelegt…" : "Konto anlegen"}
    </Button>
  );
}

export function SignupForm({ wishHandle }: { wishHandle?: string }) {
  const [state, action] = useActionState(signupAction, EMPTY_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      {wishHandle && <input type="hidden" name="h" value={wishHandle} />}
      {state.error && (
        <p role="alert" className="rounded-xl border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="rounded-xl border border-line bg-ink-2 px-4 py-3 text-sm text-ash">{state.notice}</p>
      )}

      <Field id="name" label="Wie heißt du?" error={errors.name} hint="Steht später auf deiner Seite — änderbar.">
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          aria-invalid={Boolean(errors.name)}
          aria-describedby="name-note"
          placeholder="Marie Lang"
        />
      </Field>

      <Field id="email" label="E-Mail-Adresse" error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-note" : undefined}
          placeholder="du@example.com"
        />
      </Field>

      <Field
        id="password"
        label="Passwort"
        error={errors.password}
        hint="Mindestens 10 Zeichen. Ein Satz ist besser als ein Wort mit Sonderzeichen."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          aria-invalid={Boolean(errors.password)}
          aria-describedby="password-note"
        />
      </Field>

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ash">
          <input
            type="checkbox"
            name="legal"
            required
            aria-invalid={Boolean(errors.legal)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-signal)]"
          />
          <span>
            Ich stimme den{" "}
            <Link href="/legal/agb" className="text-chalk underline underline-offset-4">
              AGB
            </Link>{" "}
            zu und habe den{" "}
            <Link href="/legal/datenschutz" className="text-chalk underline underline-offset-4">
              Datenschutzhinweis
            </Link>{" "}
            gelesen.
          </span>
        </label>
        {errors.legal && (
          <p role="alert" className="mt-1.5 text-xs text-ember">
            {errors.legal}
          </p>
        )}
      </div>

      <Submit />
    </form>
  );
}
