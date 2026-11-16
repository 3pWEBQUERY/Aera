/**
 * Kern von `useResilientActionState` — ohne React, damit er testbar bleibt.
 *
 * Eine Server Action kann auf zwei Arten scheitern, die mit dem Formular
 * nichts zu tun haben: die Anfrage kommt gar nicht erst an (Netz weg,
 * Funkloch, Server neu gestartet), oder der Server antwortet mit einem
 * Fehler statt mit einem Ergebnis. `useActionState` wirft in beiden Faellen
 * weiter, und die naechste Fehlergrenze ersetzt die ganze Seite — alles
 * Eingetippte ist weg. Hier wird daraus ein normaler Fehlerzustand am
 * Formular.
 *
 * Was Next selbst wirft (redirect, notFound, forbidden …), ist kein Fehler,
 * sondern Steuerung: das muss unveraendert weiterlaufen, sonst bliebe man nach
 * einem erfolgreichen Login auf der Login-Seite stehen.
 */

export type ActionFailureKind = "network" | "server";

/**
 * Netzfehler erkennt man daran, dass `fetch` selbst scheitert — das ist in
 * jedem Browser ein `TypeError`, nur mit anderem Text: Chrome „Failed to
 * fetch“, Firefox „NetworkError when attempting to fetch resource.“, Safari
 * „Load failed“. Ein Browser, der sich selbst offline meldet, zaehlt auch.
 */
export function classifyActionFailure(
  error: unknown,
  online: boolean = typeof navigator === "undefined" ? true : navigator.onLine !== false,
): ActionFailureKind {
  if (!online) return "network";
  if (
    error instanceof TypeError &&
    /fetch|network|load failed|connection|offline/i.test(error.message)
  ) {
    return "network";
  }
  return "server";
}

export interface ActionFailureOptions<Payload> {
  /** Uebersetzter Text fuer die Fehlerart. */
  message: (kind: ActionFailureKind) => string;
  /**
   * Wirft Next-interne Fehler weiter — im Browser `unstable_rethrow` aus
   * `next/navigation`. Wird hereingereicht, damit der Kern ohne Next laeuft.
   */
  rethrow: (error: unknown) => void;
  /** Hinweis an den Aufrufer, z. B. um Felder wiederherzustellen. */
  onFailure?: (kind: ActionFailureKind, error: unknown, payload: Payload) => void;
  /** Fuer Tests; sonst `navigator.onLine`. */
  isOnline?: () => boolean;
}

/**
 * Der Zustand nach einem Fehlschlag: der vorige plus `error`. Ein `ok: true`
 * vom letzten erfolgreichen Absenden faellt weg — sonst stuende „Gespeichert“
 * neben der Fehlermeldung.
 */
export function failureState<State extends object>(prev: State, error: string): State {
  const next = { ...prev, error } as State & { ok?: unknown; success?: unknown };
  if (next.ok === true) next.ok = false;
  if (next.success === true) next.success = false;
  return next;
}

/**
 * Umhuellt eine `useActionState`-Action: Erfolg und Next-Steuerung laufen
 * unveraendert durch, Netz- und Serverfehler werden zu `{ ...prev, error }`.
 */
export function withActionFailureState<State extends object, Payload>(
  action: (state: State, payload: Payload) => State | Promise<State>,
  options: ActionFailureOptions<Payload>,
): (state: State, payload: Payload) => Promise<State> {
  return async (state, payload) => {
    try {
      return await action(state, payload);
    } catch (error) {
      options.rethrow(error);
      const online = options.isOnline ? options.isOnline() : undefined;
      const kind = classifyActionFailure(error, online);
      if (process.env.NODE_ENV !== "production") {
        console.error("Server Action fehlgeschlagen", error);
      }
      options.onFailure?.(kind, error, payload);
      // `state` ist nach einem Erfolg schon das Ergebnis der letzten Runde.
      const prev = state !== null && typeof state === "object" ? state : ({} as State);
      return failureState(prev, options.message(kind));
    }
  };
}
