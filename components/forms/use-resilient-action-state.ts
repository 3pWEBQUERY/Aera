"use client";

import { useActionState, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { unstable_rethrow } from "next/navigation";
import { useTranslations } from "next-intl";
import { withActionFailureState } from "@/lib/action-failure";

/**
 * `useActionState` mit Netz: gleiche Signatur, gleiches Verhalten — bis die
 * Action scheitert.
 *
 * Ohne diesen Hook wirft eine abgebrochene Anfrage (Funkloch, Server weg) bis
 * zur Fehlergrenze durch, und die ersetzt die ganze Seite. Hier landet
 * stattdessen `{ ...vorher, error }` im Zustand; das Formular bleibt stehen
 * und zeigt die Meldung dort, wo es auch seine eigenen Fehler zeigt.
 *
 * Felder: Bei `<form action={…}>` setzt React das Formular nach jeder Runde
 * zurueck — auch nach einer, die nie beim Server ankam. Deshalb merkt sich der
 * Hook beim Absenden das Formular und schreibt die abgeschickten Werte nach
 * einem Fehlschlag zurueck. Formulare mit `submitWithoutReset` werden gar
 * nicht erst geleert; dort aendert das Zurueckschreiben nichts.
 *
 * redirect(), notFound() & Co. laufen unveraendert durch (`unstable_rethrow`).
 */
export function useResilientActionState<State extends object>(
  action: (state: Awaited<State>) => State | Promise<State>,
  initialState: Awaited<State>,
  permalink?: string,
): [state: Awaited<State>, dispatch: () => void, isPending: boolean];
export function useResilientActionState<State extends object, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
  permalink?: string,
): [state: Awaited<State>, dispatch: (payload: Payload) => void, isPending: boolean];
export function useResilientActionState<State extends object, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
  permalink?: string,
): [state: Awaited<State>, dispatch: (payload: Payload) => void, isPending: boolean] {
  const t = useTranslations("ui.state");
  /** Formulare der laufenden Runden, in Absende-Reihenfolge (null = kein Formular). */
  const forms = useRef<(HTMLFormElement | null)[]>([]);
  /** Nach einem Fehlschlag: was zurueckgeschrieben werden soll. */
  const restore = useRef<{ form: HTMLFormElement; data: FormData } | null>(null);

  // Intern ohne die Awaited-Akrobatik der React-Typen: der Zustand ist hier
  // immer ein fertiges Objekt, nie ein Promise.
  type Plain = Awaited<State> & object;
  const wrapped = useMemo(
    () =>
      withActionFailureState<Plain, Payload>(
        async (state, payload) => {
          // Die Runde, zu der dieser Aufruf gehoert — auch bei Erfolg abholen,
          // damit die Warteschlange nicht verrutscht.
          const form = forms.current.shift() ?? null;
          try {
            return (await action(state, payload)) as Plain;
          } catch (error) {
            if (form && payload instanceof FormData) restore.current = { form, data: payload };
            throw error;
          }
        },
        {
          message: (kind) => (kind === "network" ? t("networkError") : t("serverError")),
          rethrow: unstable_rethrow,
        },
      ),
    [action, t],
  );

  const [state, rawDispatch, isPending] = useActionState<Plain, Payload>(
    wrapped,
    initialState as Awaited<Plain>,
    permalink,
  ) as [Plain, (payload: Payload) => void, boolean];

  useLayoutEffect(() => {
    ensureSubmitListener();
  }, []);

  // Nach dem Commit — Reacts Formular-Reset ist dann schon gelaufen.
  useLayoutEffect(() => {
    const pending = restore.current;
    if (!pending) return;
    restore.current = null;
    if (pending.form.isConnected) restoreFormValues(pending.form, pending.data);
  }, [state]);

  const dispatch = useCallback(
    (payload: Payload) => {
      forms.current.push(payload instanceof FormData ? takeSubmittedForm() : null);
      rawDispatch(payload);
    },
    [rawDispatch],
  );

  return [state, dispatch, isPending];
}

/* ------------------------------------------------------------------------ */
/* Welches Formular wurde gerade abgeschickt?                                */
/* ------------------------------------------------------------------------ */

let submittedForm: HTMLFormElement | null = null;
let listening = false;

/**
 * Ein einziger Lauscher fuer die ganze Seite, in der Capture-Phase — er laeuft
 * vor Reacts eigenem Submit-Handler, der die Action im selben Ereignis
 * startet. Bis zum naechsten Task gilt das Formular als „gerade abgeschickt“;
 * spaeter (z. B. nach einer Rueckfrage) wird nichts mehr zugeordnet.
 */
function ensureSubmitListener() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener(
    "submit",
    (event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      submittedForm = event.target;
      setTimeout(() => {
        submittedForm = null;
      }, 0);
    },
    true,
  );
}

function takeSubmittedForm(): HTMLFormElement | null {
  const form = submittedForm;
  submittedForm = null;
  return form;
}

const SKIPPED_TYPES = new Set(["file", "hidden", "submit", "button", "reset", "image", "password"]);

/**
 * Schreibt abgeschickte Werte zurueck, aber nur in Felder, die React
 * zurueckgesetzt hat (Wert = Ausgangswert). Was jemand nach dem Absenden
 * schon wieder getippt hat, bleibt unangetastet.
 *
 * Passwoerter bleiben bewusst leer — wie nach jedem anderen Fehler auch.
 */
export function restoreFormValues(form: HTMLFormElement, data: FormData) {
  const seen = new Map<string, number>();
  for (const element of Array.from(form.elements)) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      )
    ) {
      continue;
    }
    const name = element.name;
    if (!name || element.disabled) continue;
    const values = data.getAll(name).filter((v): v is string => typeof v === "string");

    if (element instanceof HTMLInputElement) {
      if (SKIPPED_TYPES.has(element.type)) continue;
      if (element.type === "checkbox" || element.type === "radio") {
        if (element.checked !== element.defaultChecked) continue;
        const checked = values.includes(element.value || "on");
        if (element.checked !== checked) {
          element.checked = checked;
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }
        continue;
      }
    }

    if (element instanceof HTMLSelectElement) {
      const untouched = Array.from(element.options).every((o) => o.selected === o.defaultSelected);
      if (!untouched) continue;
      if (element.multiple) {
        for (const option of Array.from(element.options)) option.selected = values.includes(option.value);
      } else if (values[0] !== undefined && element.value !== values[0]) {
        element.value = values[0];
      } else {
        continue;
      }
      element.dispatchEvent(new Event("change", { bubbles: true }));
      continue;
    }

    // Text, Zahl, Datum, Textarea … — bei gleichem Namen der n-te Wert.
    const index = seen.get(name) ?? 0;
    seen.set(name, index + 1);
    const value = values[index];
    if (value === undefined) continue;
    const field = element as HTMLInputElement | HTMLTextAreaElement;
    if (field.value !== field.defaultValue || field.value === value) continue;
    setNativeValue(field, value);
  }
}

/**
 * Wert ueber den nativen Setter setzen und `input` ausloesen — so bemerkt
 * React die Aenderung (onChange laeuft, Zeichenzaehler stimmen wieder).
 */
function setNativeValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
