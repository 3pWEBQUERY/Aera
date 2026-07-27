"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/icons";
import { EMOJIS } from "@/lib/emoji";

/**
 * Emoji-Auswahl fuer ein Textfeld. Fuegt an der Einfuegemarke ein statt am
 * Ende — wer mitten im Satz ein Emoji setzt, will es dort haben.
 *
 * Wie die Zeichen aussehen, entscheidet das Geraet: auf iPhone und Mac sind
 * es Apples Emoji, auf Android Googles. Eine eigene Schrift mitzuliefern
 * waere weder lizenzrechtlich moeglich noch gewuenscht.
 */
export function EmojiPicker({
  targetRef,
  label,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  function insert(emoji: string) {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
    const caret = start + emoji.length;
    el.setSelectionRange(caret, caret);
    el.focus();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#161613]/50 transition hover:bg-[#161613]/5 hover:text-[#161613]"
      >
        <Icon name="smile" size={17} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="popover-in absolute bottom-full left-0 z-40 mb-2 w-[17.5rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#161613]/10 bg-white p-2 shadow-xl">
            <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insert(e)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition hover:bg-[#161613]/5"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
