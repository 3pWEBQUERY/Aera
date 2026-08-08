"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { claimHandleAction } from "@/app/actions/profile";
import { EMPTY_STATE } from "@/lib/action-state";
import { normalizeHandle } from "@/lib/handle";
import { THEME_PRESETS } from "@/lib/themes";
import { Button } from "@/components/ui/button";
import { ThemeThumbnail } from "@/components/studio/theme-thumbnail";

/**
 * Handle sichern in einem Schritt.
 *
 * Bewusst kein mehrseitiger Assistent: der einzige Grund, warum jemand gerade
 * hier ist, ist die Adresse. Alles andere — Bio, Links, Farben — lässt sich
 * danach im Studio machen, wo man sofort sieht, was passiert.
 *
 * Die Verfügbarkeit wird beim Tippen geprüft, aber die Wahrheit sagt erst der
 * Unique-Index beim Speichern. Deshalb ist das grüne Häkchen hier eine
 * Auskunft, keine Reservierung — und der Server behandelt „inzwischen weg“ als
 * normalen Fall, nicht als Absturz.
 */

interface CheckResult {
  handle: string;
  preview: string;
  available: boolean;
  reason: string | null;
  suggestions: string[];
}

export function ClaimFlow({
  defaultName,
  wishHandle,
  url,
}: {
  defaultName: string;
  wishHandle: string;
  /**
   * Die Adresse, zerlegt um die Stelle des Handles herum
   * (`profileUrlLabelParts`). Zerlegt und nicht als Suffix, weil die beiden
   * Formen verschieden herum stehen: in Produktion folgt `.aeli.so` auf den
   * Handle, lokal geht `localhost:3001/p/` ihm voraus. Ein Feld, das immer
   * nur ein Suffix anhaengt, behauptet lokal eine Adresse, die es nicht gibt.
   */
  url: { prefix: string; suffix: string };
}) {
  const [state, action] = useActionState(claimHandleAction, EMPTY_STATE);
  const [handle, setHandle] = useState(() => normalizeHandle(wishHandle || defaultName));
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [preset, setPreset] = useState<string>(THEME_PRESETS[0].key);
  const fieldId = useId();
  const latest = useRef(0);

  useEffect(() => {
    if (handle.length < 3) {
      setCheck(null);
      return;
    }
    // 350 ms: lang genug, dass ein Wort nicht als sechs Anfragen ankommt, kurz
    // genug, dass die Antwort noch zum Tippen gehört.
    const token = ++latest.current;
    setChecking(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/handle?h=${encodeURIComponent(handle)}`);
        const data = (await response.json()) as CheckResult;
        // Nur die jüngste Antwort zählt — sonst überschreibt eine langsame
        // Prüfung von vor drei Buchstaben das aktuelle Ergebnis.
        if (token === latest.current) setCheck(data);
      } catch {
        if (token === latest.current) setCheck(null);
      } finally {
        if (token === latest.current) setChecking(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [handle]);

  const serverError = state.fieldErrors?.handle;
  const problem = serverError ?? (check && !check.available ? check.reason : null);
  const isFree = Boolean(check?.available) && !serverError;

  return (
    <form action={action} className="space-y-10">
      <section>
        <label htmlFor={fieldId} className="text-sm font-medium text-chalk">
          Deine Adresse
        </label>
        <p className="mt-1 text-sm text-ash">
          Sie steht später in jeder Bio, auf jeder Karte und in jedem QR-Code. Kurz ist besser.
        </p>

        <div
          className={`mt-4 flex items-center rounded-2xl border bg-ink-2 px-4 transition-colors ${
            problem ? "border-ember" : isFree ? "border-signal" : "border-line focus-within:border-ash"
          }`}
        >
          {url.prefix && (
            <span className="shrink-0 pr-0.5 text-lg text-ash">{url.prefix}</span>
          )}
          <input
            id={fieldId}
            name="handle"
            value={handle}
            onChange={(event) => setHandle(normalizeHandle(event.target.value))}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            aria-invalid={Boolean(problem)}
            aria-describedby={`${fieldId}-note`}
            placeholder="deinname"
            className="min-w-0 flex-1 bg-transparent py-4 text-lg font-semibold tracking-tight text-chalk placeholder:text-ash/60 focus:outline-none"
          />
          {url.suffix && (
            <span className="shrink-0 pl-1 text-lg text-ash">{url.suffix}</span>
          )}
          <span className="ml-3 flex w-5 shrink-0 justify-center" aria-hidden>
            {checking ? (
              <span className="size-2 animate-pulse rounded-full bg-ash" />
            ) : isFree ? (
              <svg viewBox="0 0 16 16" className="size-4 text-signal">
                <path
                  d="M3.5 8.5l3 3 6-6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
        </div>

        <p
          id={`${fieldId}-note`}
          role={problem ? "alert" : undefined}
          className={`mt-2 min-h-5 text-xs ${problem ? "text-ember" : isFree ? "text-signal" : "text-ash"}`}
        >
          {problem ?? (isFree ? "Frei — gehört dir, sobald du weitermachst." : "3–30 Zeichen, Kleinbuchstaben, Ziffern, Bindestriche.")}
        </p>

        {check && !check.available && check.suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {check.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setHandle(suggestion)}
                className="rounded-full border border-line bg-ink-2 px-3 py-1.5 text-xs font-medium text-chalk transition-colors hover:border-signal hover:text-signal"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="text-sm font-medium text-chalk">Und wie soll sie aussehen?</p>
        <p className="mt-1 text-sm text-ash">Kannst du jederzeit ändern — auch nachdem sie online ist.</p>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {THEME_PRESETS.map((theme) => {
            const active = preset === theme.key;
            return (
              <button
                key={theme.key}
                type="button"
                onClick={() => setPreset(theme.key)}
                aria-pressed={active}
                aria-label={`Look ${theme.label} — ${theme.hint}`}
                title={theme.hint}
                className={`overflow-hidden rounded-xl border text-left transition-all ${
                  active ? "border-signal ring-2 ring-signal/30" : "border-line hover:border-ash/50"
                }`}
              >
                <ThemeThumbnail theme={{ preset: theme.key }} className="w-full" />
                <span className="block px-2.5 py-2 text-xs font-medium text-chalk">{theme.label}</span>
              </button>
            );
          })}
        </div>
        <input type="hidden" name="preset" value={preset} />
      </section>

      <input type="hidden" name="displayName" value={defaultName} />
      <Claim disabled={!isFree} />
    </form>
  );
}

function Claim({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={disabled || pending} className="w-full">
      {pending ? "Wird angelegt…" : "Handle sichern und loslegen"}
    </Button>
  );
}

