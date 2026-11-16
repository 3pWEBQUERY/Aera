"use client";

import { startTransition } from "react";

/**
 * Schickt ein Formular an eine `useActionState`-Action, ohne dass React es
 * danach zurücksetzt. Bei `<form action={fn}>` leert React 19 nach jeder
 * Antwort alle unkontrollierten Felder — nach einem Fehler müsste man alles
 * neu tippen (WCAG 3.3.7). `action={…}` bleibt am Formular zusätzlich gesetzt,
 * damit es auch ohne JavaScript abschickbar ist.
 *
 * `before` darf das Absenden abbrechen (false), z. B. für eine eigene
 * Feldprüfung oder eine Rückfrage per useConfirm.
 */
export function submitWithoutReset(
  dispatch: (fd: FormData) => void,
  before?: (form: HTMLFormElement) => boolean | Promise<boolean>,
) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter ?? undefined;
    const fd = new FormData(form, submitter);
    if (!before) {
      startTransition(() => dispatch(fd));
      return;
    }
    void Promise.resolve(before(form)).then((proceed) => {
      if (proceed) startTransition(() => dispatch(fd));
    });
  };
}
