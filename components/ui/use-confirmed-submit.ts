"use client";

import { useCallback, useRef, type FormEvent } from "react";
import type { ConfirmOptions } from "./confirm-dialog";

/**
 * Rueckfrage vor dem Abschicken eines Formulars (Server-Action), als Ersatz
 * fuer `onSubmit={(e) => { if (!confirm(…)) e.preventDefault(); }}`.
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   const confirmSubmit = useConfirmedSubmit(confirm);
 *   <form action={…} onSubmit={(e) => confirmSubmit(e, { title, confirmLabel, tone: "danger" })}>
 *
 * Der erste Submit wird angehalten und fragt; nach „Ja“ schickt das Formular
 * sich selbst noch einmal ab (mit demselben Absende-Knopf), diesmal ohne
 * Rueckfrage. So greift die Frage auch bei Enter im Eingabefeld.
 */
export function useConfirmedSubmit(
  confirm: (options: ConfirmOptions) => Promise<boolean>,
): (event: FormEvent<HTMLFormElement>, options: ConfirmOptions) => boolean {
  const bypass = useRef(false);
  return useCallback(
    (event, options) => {
      if (bypass.current) {
        bypass.current = false;
        return true;
      }
      event.preventDefault();
      const form = event.currentTarget;
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
      void confirm(options).then((ok) => {
        if (!ok || !form.isConnected) return;
        bypass.current = true;
        form.requestSubmit(submitter ?? undefined);
      });
      return false;
    },
    [confirm],
  );
}
