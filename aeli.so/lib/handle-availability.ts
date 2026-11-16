import "server-only";
import { freeHandleCandidates, handleTaken } from "./db-functions";
import { RESERVED_HANDLES, checkHandle, type HandleProblem } from "./handle";

export type HandleStatus = { ok: true } | { ok: false; reason: HandleProblem | "taken" };

/**
 * Ist dieser Handle noch frei?
 *
 * Das ist die eine Frage, die die RLS-Policies nicht beantworten können — und
 * zwar aus gutem Grund: `aeli_app` sieht fremde ENTWÜRFE nicht. Ein Handle,
 * den jemand reserviert aber noch nicht veröffentlicht hat, sähe darüber frei
 * aus, und die Person davor bekäme beim Speichern einen Datenbankfehler statt
 * einer Antwort.
 *
 * Deshalb stellt diese Prüfung eine eigene Datenbankfunktion
 * (`aeli_handle_taken`), die kein einziges Feld eines fremden Profils
 * herausgibt — zurück kommt ja oder nein, mehr nicht. Sie zählt auch alte
 * Handles mit, die nach einem Wechsel noch 90 Tage reserviert sind.
 *
 * Der Unique-Index bleibt trotzdem die Instanz, die entscheidet: zwischen
 * dieser Frage und dem Speichern liegt Zeit, in der jemand anderes zugreifen
 * kann. Die Aufrufer behandeln P2002 deshalb als „inzwischen vergeben“.
 */
export async function handleStatus(input: string, ownProfileId?: string): Promise<HandleStatus> {
  const handle = input.trim().toLowerCase();
  const problem = checkHandle(handle);
  if (problem) return { ok: false, reason: problem };

  if (await handleTaken(handle, ownProfileId)) return { ok: false, reason: "taken" };
  return { ok: true };
}

/** Freie Vorschläge aus einer Liste von Kandidaten. */
export async function freeHandles(candidates: string[]): Promise<string[]> {
  const usable = candidates.filter((c) => !RESERVED_HANDLES.has(c));
  if (usable.length === 0) return [];
  const free = new Set(await freeHandleCandidates(usable));
  return usable.filter((candidate) => free.has(candidate));
}

export const HANDLE_PROBLEM_TEXT: Record<HandleProblem | "taken", string> = {
  empty: "Bitte such dir einen Handle aus.",
  tooShort: "Mindestens 3 Zeichen.",
  tooLong: "Höchstens 30 Zeichen.",
  charset: "Erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche.",
  edges: "Darf nicht mit einem Bindestrich anfangen oder enden.",
  doubleDash: "Zwei Bindestriche hintereinander gehen leider nicht.",
  numericOnly: "Nur Ziffern sieht aus wie eine Nummer, nicht wie ein Name.",
  reserved: "Dieser Handle ist für Aeli selbst reserviert.",
  taken: "Der ist schon vergeben.",
};
