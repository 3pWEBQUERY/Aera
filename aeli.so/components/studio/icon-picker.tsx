"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ICON_GROUPS, ICONS, Icon, iconLabel } from "@/components/icon";

/**
 * Ein Zeichen aussuchen — für Bausteine wie für Kartenreiter.
 *
 * Eine Auswahl für beides, weil es dieselbe Frage ist: welches Zeichen steht
 * neben diesem Wort? Zwei Auswahlen mit verschiedenen Vorräten wären zwei
 * Antworten auf eine Frage, und man sähe es der Seite an.
 *
 * Kein Feld für „etwas anderes". Beim vorherigen Emoji-Vorrat war das die
 * Notausfahrt, weil ein Emoji-Katalog nie vollständig ist. Bei einem
 * gezeichneten Satz wäre sie das Gegenteil: sein ganzer Sinn ist, dass alle
 * Zeichen zusammenpassen.
 */

const COLUMNS = 4;

export function IconPicker({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Zu, sobald der Zeiger oder der Fokus das Feld verlässt. Beides, weil beide
  // Wege benutzt werden: mit der Maus klickt man daneben, mit der Tastatur
  // tabbt man weiter.
  useEffect(() => {
    if (!open) return;
    function leave(event: Event) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", leave);
    document.addEventListener("focusin", leave);
    return () => {
      document.removeEventListener("pointerdown", leave);
      document.removeEventListener("focusin", leave);
    };
  }, [open]);

  // Beim Öffnen in die Auswahl springen: das gewählte Zeichen, sonst das erste.
  useEffect(() => {
    if (!open) return;
    const cells = gridRef.current?.querySelectorAll<HTMLButtonElement>("[data-icon]");
    if (!cells?.length) return;
    ([...cells].find((cell) => cell.dataset.icon === value) ?? cells[0]!).focus();
  }, [open, value]);

  function choose(key: string) {
    setValue(key);
    setOpen(false);
    triggerRef.current?.focus();
  }

  /**
   * Pfeiltasten im Raster. Vier Spalten heißt: links/rechts ist ein Schritt,
   * hoch/runter sind vier — über Gruppengrenzen hinweg, weil die Gruppen eine
   * Lesehilfe sind und keine Wand.
   */
  function onGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" ? 1
      : event.key === "ArrowLeft" ? -1
      : event.key === "ArrowDown" ? COLUMNS
      : event.key === "ArrowUp" ? -COLUMNS
      : 0;
    if (step === 0) return;

    const current = (event.target as HTMLElement).dataset.icon;
    const from = ICONS.findIndex((icon) => icon.key === current);
    const next = from + step;
    if (next < 0 || next >= ICONS.length) return;

    event.preventDefault();
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
  }

  const label = value ? (iconLabel(value) ?? "Eigenes") : "Keins";

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <input type="hidden" name={name} value={value} />

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-ink px-3 text-left transition-colors hover:border-ash focus:border-signal focus:outline-none"
      >
        <span className="flex size-5 shrink-0 items-center justify-center text-chalk">
          {value ? (
            <Icon name={value} className="size-5" />
          ) : (
            <span aria-hidden className="size-1.5 rounded-full bg-ash/60" />
          )}
        </span>
        <span className={`flex-1 truncate text-sm ${value ? "text-chalk" : "text-ash"}`}>
          {label}
        </span>
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 text-ash">
          <path
            d="M4 6.5l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Zeichen auswählen"
          className="absolute z-30 mt-1.5 w-60 rounded-xl border border-line bg-ink-2 p-2 shadow-2xl shadow-black/60"
        >
          <div ref={gridRef} onKeyDown={onGridKeyDown} className="max-h-72 overflow-y-auto pr-0.5">
            {ICON_GROUPS.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                <p className="px-1 py-1 text-[0.65rem] font-medium tracking-wider text-ash uppercase">
                  {group.label}
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {group.icons.map((icon) => (
                    <button
                      key={icon.key}
                      type="button"
                      data-icon={icon.key}
                      data-index={ICONS.findIndex((entry) => entry.key === icon.key)}
                      title={icon.label}
                      aria-label={icon.label}
                      aria-pressed={icon.key === value}
                      onClick={() => choose(icon.key)}
                      className={`flex aspect-square items-center justify-center rounded-lg transition-colors focus:outline-none ${
                        icon.key === value
                          ? "bg-signal/20 text-signal ring-1 ring-signal"
                          : "text-ash hover:bg-ink-3 hover:text-chalk focus-visible:bg-ink-3 focus-visible:text-chalk focus-visible:ring-1 focus-visible:ring-ash"
                      }`}
                    >
                      <Icon name={icon.key} className="size-5" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 border-t border-line pt-2">
            <button
              type="button"
              onClick={() => choose("")}
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-ash transition-colors hover:text-chalk"
            >
              Kein Zeichen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
