"use client";

import { useState, useTransition } from "react";
import { addBlockAction } from "@/app/actions/profile";
import { BLOCK_CATALOG, BLOCK_GROUPS } from "@/lib/blocks";
import { Button } from "@/components/ui/button";
import { AeraMark } from "@/components/aera-mark";
import { Icon } from "@/components/icon";

/**
 * Der Baukasten.
 *
 * Ausgeklappt statt in einem Menü versteckt: die Bausteine sind das, was Aeli
 * von einer Linkliste unterscheidet, und was in einem Untermenü liegt, findet
 * niemand. Gruppiert nach dem Zweck („Verdienen“, „Kontakt“), nicht nach der
 * technischen Herkunft.
 *
 * Bausteine, die eine verknüpfte Community brauchen, verschwinden nicht, wenn
 * keine da ist — sie stehen ausgegraut mit dem Grund dabei. Ein fehlender
 * Eintrag wirft die Frage auf, ob es ihn überhaupt gibt.
 */
export function AddBlock({
  cardId,
  hasCommunity,
}: {
  /** Auf welche Karte der neue Baustein kommt — die gerade bearbeitete. */
  cardId: string;
  hasCommunity: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button tone="ghost" onClick={() => setOpen(true)} className="w-full">
        <span aria-hidden className="text-base leading-none">
          +
        </span>
        Baustein hinzufügen
      </Button>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-ink-2 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-chalk">Was soll auf die Seite?</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-2 py-1 text-xs text-ash transition-colors hover:text-chalk"
        >
          Schließen
        </button>
      </div>

      <div className="space-y-5">
        {BLOCK_GROUPS.map((group) => {
          const entries = BLOCK_CATALOG.filter((entry) => entry.group === group.key);
          if (entries.length === 0) return null;

          return (
            <div key={group.key}>
              <h3 className="mb-2 text-xs font-medium tracking-wider text-ash uppercase">
                {group.label}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {entries.map((entry) => {
                  const blocked = entry.needsCommunity && !hasCommunity;
                  return (
                    <button
                      key={entry.type}
                      type="button"
                      disabled={blocked || pending}
                      onClick={() => {
                        const form = new FormData();
                        form.append("type", entry.type);
                        form.append("cardId", cardId);
                        startTransition(() => addBlockAction(form));
                        setOpen(false);
                      }}
                      className="group relative flex gap-3 rounded-lg border border-line bg-ink p-3 text-left transition-colors enabled:hover:border-signal/60 enabled:hover:bg-ink-3 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span
                        aria-hidden
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-ash transition-colors group-enabled:group-hover:border-signal/50 group-enabled:group-hover:text-signal"
                      >
                        <Icon name={entry.icon} className="size-4" />
                      </span>
                      {/* Aeras Zeichen an den Bausteinen, die ohne Aera nicht
                          funktionieren. `needsCommunity` ist genau diese Menge —
                          ein zweites Feld daneben könnte nur auseinanderlaufen.
                          Die Kachel ist minimal heller als die Karte; der Ring
                          gibt ihr eine Kante, ohne das Zeichen anzufassen. */}
                      {entry.needsCommunity && (
                        <AeraMark className="absolute top-2.5 right-2.5 size-5 rounded-[4px] ring-1 ring-white/10" />
                      )}
                      <span className={`min-w-0 ${entry.needsCommunity ? "pr-5" : ""}`}>
                        <span className="block text-sm font-medium text-chalk">{entry.label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-ash">
                          {blocked ? "Braucht eine verknüpfte Community." : entry.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
