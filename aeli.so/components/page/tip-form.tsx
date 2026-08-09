"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { startTipAction } from "@/app/actions/tip";
import { EMPTY_STATE } from "@/lib/action-state";
import { DEFAULT_TIP_AMOUNTS } from "@/lib/tip-amount";
import type { PageBlock, PageData, PageMode } from "./types";

/**
 * Trinkgeld geben.
 *
 * Der Baustein ist der einzige auf einer Bio-Seite, bei dem etwas abgebucht
 * wird. Deshalb steht die Zahl, um die es geht, zweimal da: einmal als
 * gewählter Knopf und einmal auf dem Knopf, der zur Kasse führt. Wer klickt,
 * soll nicht raten müssen, was gleich passiert.
 *
 * Kein Konto, keine Anmeldung — wer zwei Euro geben will, legt dafür keins an.
 * Alles, was der Server über den Absender erfährt, ist die Adresse, die Stripe
 * für den Beleg abfragt.
 */

function euro(cents: number): string {
  return cents % 100 === 0
    ? `${cents / 100} €`
    : (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export function TipForm({
  block,
  page,
  mode,
  style,
}: {
  block: PageBlock;
  page: PageData;
  mode: PageMode;
  style: React.CSSProperties;
}) {
  const amounts = block.config.amounts?.length ? block.config.amounts : DEFAULT_TIP_AMOUNTS;
  const [state, action] = useActionState(startTipAction, EMPTY_STATE);
  const [chosen, setChosen] = useState<number | "custom">(amounts[0]!);
  const [custom, setCustom] = useState("");

  const amountValue = chosen === "custom" ? custom : String(chosen / 100);
  const previewCents =
    chosen === "custom" ? Math.round(Number.parseFloat(custom.replace(",", ".")) * 100) : chosen;
  const label =
    Number.isFinite(previewCents) && previewCents > 0
      ? `${euro(previewCents)} geben`
      : "Betrag wählen";

  return (
    <section style={style} className="aeli-rise aeli-surface space-y-3 p-4">
      {block.title && <h3 className="aeli-display text-base font-semibold">{block.title}</h3>}
      {block.subtitle && <p className="-mt-1.5 text-xs opacity-70">{block.subtitle}</p>}

      <form
        action={action}
        // In der Vorschau darf nichts passieren: das Studio zeigt die Seite,
        // es ist nicht die Seite.
        onSubmit={mode === "preview" ? (event) => event.preventDefault() : undefined}
        className="space-y-2.5"
      >
        <input type="hidden" name="handle" value={page.handle} />
        <input type="hidden" name="blockId" value={block.id} />
        <input type="hidden" name="amount" value={amountValue} />

        <div className="flex flex-wrap gap-1.5">
          {amounts.map((cents) => (
            <button
              key={cents}
              type="button"
              onClick={() => setChosen(cents)}
              aria-pressed={chosen === cents}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                chosen === cents
                  ? "border-transparent bg-[var(--aeli-accent)] text-[var(--aeli-accent-fg)]"
                  : "border-[var(--aeli-border)] hover:border-current/40"
              }`}
            >
              {euro(cents)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setChosen("custom")}
            aria-pressed={chosen === "custom"}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              chosen === "custom"
                ? "border-transparent bg-[var(--aeli-accent)] text-[var(--aeli-accent-fg)]"
                : "border-[var(--aeli-border)] hover:border-current/40"
            }`}
          >
            Anderer
          </button>
        </div>

        {chosen === "custom" && (
          <label className="flex items-center gap-2 rounded-[calc(var(--aeli-radius)*0.6)] border border-[var(--aeli-border)] px-3">
            <span className="sr-only">Betrag in Euro</span>
            <input
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              inputMode="decimal"
              placeholder="7,50"
              autoFocus
              className="min-w-0 flex-1 bg-transparent py-2 text-sm focus:outline-none"
            />
            <span aria-hidden className="text-sm opacity-60">
              €
            </span>
          </label>
        )}

        <input
          name="message"
          maxLength={280}
          placeholder="Gruß (optional)"
          className="w-full rounded-[calc(var(--aeli-radius)*0.6)] border border-[var(--aeli-border)] bg-transparent px-3 py-2 text-sm placeholder:opacity-50 focus:outline-none"
        />

        {(state.error || state.fieldErrors?.amount) && (
          <p role="alert" className="text-xs font-medium text-[#e2564a]">
            {state.fieldErrors?.amount ?? state.error}
          </p>
        )}

        <Submit label={label} disabled={mode === "preview"} />

        <p className="text-center text-[0.65rem] opacity-55">
          Zahlung über Stripe. Kein Konto nötig.
        </p>
      </form>
    </section>
  );
}

function Submit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="aeli-btn-solid w-full rounded-[var(--aeli-radius)] px-4 py-3 text-sm font-semibold disabled:opacity-70"
    >
      {pending ? "Einen Moment …" : label}
    </button>
  );
}
