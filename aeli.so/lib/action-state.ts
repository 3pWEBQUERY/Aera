/**
 * Der Rückgabewert jeder Server-Action.
 *
 * `useActionState` braucht einen Wert, der auch beim ersten Rendern existiert.
 * Ein gemeinsamer Typ dafür heißt: jedes Formular in der App zeigt Fehler an
 * derselben Stelle an, und ein neues Formular muss sich nichts ausdenken.
 *
 * `fieldErrors` ist getrennt von `error`, weil die beiden verschieden
 * dargestellt werden: Feldfehler stehen am Feld, `error` steht über dem
 * Formular ("Anmeldung fehlgeschlagen").
 */
export interface FormState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  /** Freie Nutzlast für Actions, deren Ergebnis das Formular weiterverwendet. */
  data?: Record<string, unknown>;
}

export const EMPTY_STATE: FormState = {};

export function fieldError(field: string, message: string): FormState {
  return { fieldErrors: { [field]: message } };
}

export function formError(message: string): FormState {
  return { error: message };
}

/**
 * Nimmt einen Formularwert entgegen und gibt einen getrimmten String zurück —
 * `FormData` liefert `File | string | null`, und ein `File` in einem Textfeld
 * ist ein Programmierfehler, kein Nutzerfehler.
 */
export function text(form: FormData, key: string, maxLength = 5000): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function checkbox(form: FormData, key: string): boolean {
  return form.get(key) === "on" || form.get(key) === "true";
}
