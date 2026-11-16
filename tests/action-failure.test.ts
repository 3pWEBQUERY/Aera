import { describe, expect, it, vi } from "vitest";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import {
  classifyActionFailure,
  failureState,
  withActionFailureState,
} from "@/lib/action-failure";

type State = { error?: string; ok?: boolean; email?: string };

const messages = {
  network: "Keine Verbindung zum Server. Deine Eingaben sind noch da – sende das Formular erneut.",
  server: "Das hat nicht geklappt. Bitte versuche es noch einmal.",
};

function wrap(
  action: (state: State, fd: FormData) => Promise<State>,
  opts: { online?: boolean; onFailure?: () => void } = {},
) {
  return withActionFailureState<State, FormData>(action, {
    message: (kind) => messages[kind],
    rethrow: unstable_rethrow,
    isOnline: () => opts.online ?? true,
    onFailure: opts.onFailure,
  });
}

describe("classifyActionFailure", () => {
  it("erkennt abgebrochene Anfragen in allen Browsern als Netzfehler", () => {
    expect(classifyActionFailure(new TypeError("Failed to fetch"), true)).toBe("network");
    expect(
      classifyActionFailure(new TypeError("NetworkError when attempting to fetch resource."), true),
    ).toBe("network");
    expect(classifyActionFailure(new TypeError("Load failed"), true)).toBe("network");
  });

  it("zaehlt alles andere als Serverfehler — ausser der Browser ist offline", () => {
    expect(classifyActionFailure(new Error("An unexpected response was received from the server."), true)).toBe(
      "server",
    );
    expect(classifyActionFailure(new TypeError("x is not a function"), true)).toBe("server");
    expect(classifyActionFailure(new Error("boom"), false)).toBe("network");
  });
});

describe("withActionFailureState", () => {
  it("reicht das Ergebnis einer erfolgreichen Action unveraendert durch", async () => {
    const run = wrap(async () => ({ ok: true }));
    await expect(run({}, new FormData())).resolves.toEqual({ ok: true });
  });

  it("macht aus einem Netzfehler einen Fehlerzustand und behaelt den vorigen Zustand", async () => {
    const onFailure = vi.fn();
    const run = wrap(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      { onFailure },
    );
    const next = await run({ email: "a@b.test" }, new FormData());
    expect(next).toEqual({ email: "a@b.test", error: messages.network });
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it("macht aus einem Serverfehler die allgemeine Meldung und nimmt ein altes ok zurueck", async () => {
    const run = wrap(async () => {
      throw Object.assign(new Error("An error occurred in the Server Components render."), {
        digest: "123",
      });
    });
    await expect(run({ ok: true }, new FormData())).resolves.toEqual({
      ok: false,
      error: messages.server,
    });
  });

  it("laesst redirect() und notFound() unveraendert durch", async () => {
    const toHome = wrap(async () => redirect("/home"));
    await expect(toHome({}, new FormData())).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;/),
    });

    const missing = wrap(async () => notFound());
    await expect(missing({}, new FormData())).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/),
    });
  });

  it("findet Next-Fehler auch als Ursache (cause) eines anderen Fehlers", async () => {
    let inner: unknown;
    try {
      redirect("/login");
    } catch (error) {
      inner = error;
    }
    const run = wrap(async () => {
      throw new Error("wrapped", { cause: inner });
    });
    await expect(run({}, new FormData())).rejects.toBe(inner);
  });
});

describe("failureState", () => {
  it("setzt nur ok/success zurueck, die vorher wahr waren", () => {
    expect(failureState({ ok: undefined, email: "x" } as State, "e")).toEqual({
      ok: undefined,
      email: "x",
      error: "e",
    });
    expect(failureState({ success: true } as { success?: boolean; error?: string }, "e")).toEqual({
      success: false,
      error: "e",
    });
  });
});
