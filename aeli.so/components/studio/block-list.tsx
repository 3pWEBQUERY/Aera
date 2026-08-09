"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteBlockAction,
  duplicateBlockAction,
  reorderBlocksAction,
  toggleBlockAction,
} from "@/app/actions/profile";
import { blockDescriptor, blockVisibilityReason } from "@/lib/blocks";
import { BlockEditor } from "./block-editor";
import type { StudioBlock } from "./types";

/**
 * Die Blockliste mit Sortierung.
 *
 * Zwei Wege, dieselbe Handlung:
 *
 *  - Ziehen am Griff (HTML5 Drag & Drop). Die Einfügemarke ist eine Linie,
 *    nicht eine verschobene Karte — die Liste soll unter dem Cursor ruhig
 *    bleiben, sonst zielt man auf ein bewegliches Ziel.
 *  - Tastatur: Griff fokussieren, Pfeil hoch/runter. Ohne diesen Weg wäre
 *    Sortieren für alle unmöglich, die keine Maus benutzen — und Sortieren ist
 *    die häufigste Handlung im Studio.
 *
 * Die Reihenfolge wird lokal sofort umgestellt und danach vollständig
 * gespeichert (die ganze ID-Liste, nicht ein „verschiebe um eins“). Bei zwei
 * offenen Fenstern gewinnt damit die zuletzt gespeicherte Liste, statt dass
 * sich zwei Verschiebungen zu einer dritten Reihenfolge addieren.
 */
export function BlockList({
  blocks: incoming,
  tipsEnabled,
}: {
  blocks: StudioBlock[];
  /**
   * Nur für den Hinweis am Trinkgeld-Baustein. Ohne verbundenes Konto zeigt er
   * auf der Seite nichts an, und das sieht von hier aus wie ein Fehler.
   */
  tipsEnabled: boolean;
}) {
  const [blocks, setBlocks] = useState(incoming);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const [, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const gripRefs = useRef(new Map<string, HTMLButtonElement>());

  // Der Server bleibt die Wahrheit. Nach jedem Speichern kommen die Blöcke neu
  // herein — inklusive der Felder, die die Action verändert hat.
  useEffect(() => setBlocks(incoming), [incoming]);

  function persist(next: StudioBlock[]) {
    setBlocks(next);
    startTransition(() => reorderBlocksAction(next.map((block) => block.id)));
  }

  function move(id: string, delta: number) {
    const from = blocks.findIndex((block) => block.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    persist(next);
    setAnnouncement(`${label(moved!)} auf Position ${to + 1} von ${next.length}.`);
    // Der Fokus wandert mit dem Block mit; sonst bewegt die nächste
    // Pfeiltaste plötzlich einen anderen.
    requestAnimationFrame(() => gripRefs.current.get(id)?.focus());
  }

  function dropOn(targetId: string, after: boolean) {
    if (!dragId || dragId === targetId) return;
    const next = blocks.filter((block) => block.id !== dragId);
    const moved = blocks.find((block) => block.id === dragId)!;
    const index = next.findIndex((block) => block.id === targetId);
    next.splice(after ? index + 1 : index, 0, moved);
    persist(next);
  }

  return (
    <div className="space-y-2">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {blocks.map((block, index) => {
        const descriptor = blockDescriptor(block.type);
        const reason = blockVisibilityReason({
          isVisible: block.isVisible,
          startsAt: block.startsAt ? new Date(block.startsAt) : null,
          endsAt: block.endsAt ? new Date(block.endsAt) : null,
        });
        const isOpen = openId === block.id;
        const isDropTarget = dropTarget?.id === block.id;

        return (
          <article
            key={block.id}
            onDragOver={(event) => {
              if (!dragId) return;
              event.preventDefault();
              const box = event.currentTarget.getBoundingClientRect();
              setDropTarget({ id: block.id, after: event.clientY > box.top + box.height / 2 });
            }}
            onDragLeave={() => setDropTarget((current) => (current?.id === block.id ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              if (dropTarget?.id === block.id) dropOn(block.id, dropTarget.after);
              setDropTarget(null);
              setDragId(null);
            }}
            className={`overflow-hidden rounded-xl border bg-ink-2 transition-colors ${
              isOpen ? "border-ash/40" : "border-line"
            } ${dragId === block.id ? "aeli-dragging" : ""} ${
              isDropTarget ? (dropTarget.after ? "aeli-drop-after" : "aeli-drop-before") : ""
            }`}
          >
            <div className="flex items-center gap-1 p-2">
              <button
                type="button"
                ref={(node) => {
                  if (node) gripRefs.current.set(block.id, node);
                  else gripRefs.current.delete(block.id);
                }}
                draggable
                onDragStart={() => setDragId(block.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setDropTarget(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    move(block.id, -1);
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    move(block.id, 1);
                  }
                }}
                aria-label={`${label(block)} verschieben — Position ${index + 1} von ${blocks.length}. Mit Pfeil hoch und runter bewegen.`}
                className="aeli-grip flex size-9 shrink-0 items-center justify-center rounded-lg text-ash transition-colors hover:bg-line hover:text-chalk"
              >
                <svg viewBox="0 0 16 16" aria-hidden className="size-4">
                  <g fill="currentColor">
                    <circle cx="6" cy="4" r="1.2" />
                    <circle cx="10" cy="4" r="1.2" />
                    <circle cx="6" cy="8" r="1.2" />
                    <circle cx="10" cy="8" r="1.2" />
                    <circle cx="6" cy="12" r="1.2" />
                    <circle cx="10" cy="12" r="1.2" />
                  </g>
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : block.id)}
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-line/50"
              >
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-ink text-sm text-ash"
                >
                  {block.icon || descriptor.icon}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={`truncate text-sm font-medium ${reason ? "text-ash" : "text-chalk"}`}
                    >
                      {label(block)}
                    </span>
                    {reason && <StatusPill reason={reason} />}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-ash">
                    <span>{descriptor.label}</span>
                    {block.clickCount > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {block.clickCount} {block.clickCount === 1 ? "Klick" : "Klicks"}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </button>

              <RowAction
                title={block.isVisible ? "Ausblenden" : "Einblenden"}
                onClick={() =>
                  startTransition(() => toggleBlockAction(formOf({ id: block.id })))
                }
              >
                {block.isVisible ? <EyeIcon /> : <EyeOffIcon />}
              </RowAction>

              <RowAction
                title="Duplizieren"
                onClick={() => startTransition(() => duplicateBlockAction(formOf({ id: block.id })))}
              >
                <CopyIcon />
              </RowAction>

              <RowAction
                title="Löschen"
                danger
                onClick={() => {
                  // Eine Rückfrage statt eines Papierkorbs: ein gelöschter Block
                  // ist zwei Klicks Arbeit, ein Papierkorb wäre eine dauerhaft
                  // sichtbare Liste von Dingen, die niemand mehr will.
                  if (!window.confirm(`„${label(block)}“ wirklich löschen?`)) return;
                  startTransition(() => deleteBlockAction(formOf({ id: block.id })));
                }}
              >
                <TrashIcon />
              </RowAction>
            </div>

            {isOpen && (
              <BlockEditor
                block={block}
                tipsEnabled={tipsEnabled}
                onDone={() => setOpenId(null)}
              />
            )}
          </article>
        );
      })}
    </div>
  );
}

function label(block: StudioBlock): string {
  return block.title?.trim() || blockDescriptor(block.type).label;
}

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.append(key, value);
  return form;
}

function StatusPill({ reason }: { reason: "hidden" | "scheduled" | "expired" }) {
  const text = { hidden: "versteckt", scheduled: "geplant", expired: "abgelaufen" }[reason];
  return (
    <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[0.65rem] text-ash">
      {text}
    </span>
  );
}

function RowAction({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-ash transition-colors hover:bg-line ${
        danger ? "hover:text-ember" : "hover:text-chalk"
      }`}
    >
      {children}
    </button>
  );
}

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden {...ICON}>
      <path d="M1.8 10S4.9 4.8 10 4.8 18.2 10 18.2 10 15.1 15.2 10 15.2 1.8 10 1.8 10z" />
      <circle cx="10" cy="10" r="2.4" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden {...ICON}>
      <path d="M4 4l12 12" />
      <path d="M7.4 6.1A8.6 8.6 0 0 1 10 5.8c5.1 0 8.2 4.2 8.2 4.2a13 13 0 0 1-3 3.3" />
      <path d="M5 7.2A13 13 0 0 0 1.8 10s3.1 4.2 8.2 4.2c.8 0 1.6-.1 2.3-.3" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden {...ICON}>
      <rect x="6.8" y="6.8" width="9.4" height="9.4" rx="2" />
      <path d="M13.2 4.4a2 2 0 0 0-1.6-.8H5.8a2 2 0 0 0-2 2v5.8c0 .6.3 1.2.8 1.6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden {...ICON}>
      <path d="M3.8 5.5h12.4" />
      <path d="M8 5.5V4.2A1.2 1.2 0 0 1 9.2 3h1.6A1.2 1.2 0 0 1 12 4.2v1.3" />
      <path d="M5.4 5.5l.7 9.6A1.6 1.6 0 0 0 7.7 16.6h4.6a1.6 1.6 0 0 0 1.6-1.5l.7-9.6" />
    </svg>
  );
}
