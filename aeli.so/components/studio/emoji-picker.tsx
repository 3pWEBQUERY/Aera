"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Das Zeichen vor einem Baustein.
 *
 * Vorher war das ein Textfeld mit dem Platzhalter „🎧". Wer kein Emoji im
 * Kopf hat, tippt dort nichts hinein — und wer eins im Kopf hat, muss es
 * woanders suchen und hereinkopieren. Ein Feld, das nur von Leuten bedient
 * werden kann, die die Antwort schon kennen, ist kein Feld.
 *
 * Also eine Auswahl. Kein vollständiger Emoji-Katalog: die 64 hier sind die,
 * die auf eine Bio-Seite gehören, nach dem geordnet, worauf ein Link zeigt.
 * Ein Katalog mit 3.700 Zeichen wäre vollständiger und schlechter — man
 * scrollt dann an genau denselben acht vorbei, die man am Ende nimmt.
 *
 * Das Textfeld unten bleibt trotzdem: wer ein Zeichen braucht, das hier nicht
 * steht, soll nicht an der Auswahl scheitern, die ihm helfen sollte.
 *
 * Nicht zu verwechseln mit `icon-picker.tsx`, der Auswahl fuer die
 * Kartenreiter. Die sieht gleich aus und meint etwas anderes: ein Emoji am
 * Baustein ist Inhalt und darf bunt sein, das Zeichen eines Reiters gehoert
 * zur Navigation und muss die Farbe des Themes annehmen. Die Begruendung
 * steht ausfuehrlich in `components/card-icon.tsx`.
 */

const GROUPS: { label: string; emojis: string[] }[] = [
  { label: "Medien", emojis: ["▶️", "🎬", "📺", "🎥", "🎧", "🎵", "🎙", "📻"] },
  { label: "Bild & Kunst", emojis: ["📷", "📸", "🖼", "🎨", "✏️", "🖌", "📐", "✨"] },
  { label: "Verkaufen", emojis: ["🛍", "🛒", "💳", "🏷", "📦", "💎", "🎁", "💰"] },
  { label: "Schreiben", emojis: ["✉️", "📬", "📝", "📄", "📚", "📰", "🔖", "💬"] },
  { label: "Termine", emojis: ["📅", "🗓", "⏰", "🎟", "🎪", "🏟", "📍", "🗺"] },
  { label: "Community", emojis: ["👥", "🤝", "💜", "⭐️", "🔥", "🏆", "🙌", "👋"] },
  { label: "Lernen", emojis: ["🎓", "🧠", "💡", "🔧", "🧪", "📊", "🧭", "❓"] },
  { label: "Zeichen", emojis: ["➡️", "⬇️", "✅", "⚡️", "🔒", "🌐", "☕️", "🍀"] },
];

/** Alle Zeichen in Anzeigereihenfolge — für die Pfeiltasten. */
const FLAT = GROUPS.flatMap((group) => group.emojis);
const COLUMNS = 4;

export function EmojiPicker({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Zu, sobald der Fokus oder der Zeiger das Feld verlässt. Beides, weil beide
  // Wege benutzt werden: mit der Maus klickt man daneben, mit der Tastatur
  // tabbt man weiter.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onFocusIn(event: FocusEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  // Beim Öffnen in die Auswahl springen: das gewählte Zeichen, sonst das erste.
  useEffect(() => {
    if (!open) return;
    const cells = gridRef.current?.querySelectorAll<HTMLButtonElement>("[data-emoji]");
    if (!cells?.length) return;
    const current = [...cells].find((cell) => cell.dataset.emoji === value);
    (current ?? cells[0]!).focus();
  }, [open, value]);

  function choose(emoji: string) {
    setValue(emoji);
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

    const active = (event.target as HTMLElement).dataset.emoji;
    const from = active ? FLAT.indexOf(active) : 0;
    const next = from + step;
    if (next < 0 || next >= FLAT.length) return;

    event.preventDefault();
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)
      ?.focus();
  }

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
        className="flex h-11 w-full items-center gap-2 rounded-xl border border-line bg-ink px-3 text-left transition-colors hover:border-ash focus:border-signal focus:outline-none"
      >
        <span className="text-lg leading-none">{value || "🙂"}</span>
        <span className={`flex-1 truncate text-sm ${value ? "text-chalk" : "text-ash"}`}>
          {value ? "Gewählt" : "Keins"}
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
          className="absolute z-30 mt-1.5 w-64 rounded-xl border border-line bg-ink-2 p-2 shadow-2xl shadow-black/60"
        >
          <div ref={gridRef} onKeyDown={onGridKeyDown} className="max-h-64 overflow-y-auto pr-0.5">
            {GROUPS.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                <p className="px-1 py-1 text-[0.65rem] font-medium tracking-wider text-ash uppercase">
                  {group.label}
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      data-emoji={emoji}
                      data-index={FLAT.indexOf(emoji)}
                      aria-label={emoji}
                      aria-pressed={emoji === value}
                      onClick={() => choose(emoji)}
                      className={`flex aspect-square items-center justify-center rounded-lg text-xl transition-colors focus:outline-none ${
                        emoji === value
                          ? "bg-signal/20 ring-1 ring-signal"
                          : "hover:bg-ink-3 focus-visible:bg-ink-3 focus-visible:ring-1 focus-visible:ring-ash"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
            <input
              value={value}
              onChange={(event) => setValue([...event.target.value].slice(0, 2).join(""))}
              maxLength={8}
              placeholder="Eigenes"
              aria-label="Eigenes Zeichen"
              className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-2 py-1.5 text-center text-base focus:border-signal focus:outline-none"
            />
            <button
              type="button"
              onClick={() => choose("")}
              className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-ash transition-colors hover:text-chalk"
            >
              Entfernen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
