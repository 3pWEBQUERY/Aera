"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  addCardAction,
  deleteCardAction,
  reorderCardsAction,
  toggleCardAction,
  updateCardAction,
} from "@/app/actions/cards";
import { EMPTY_STATE } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { IconPicker } from "./icon-picker";
import { Icon } from "@/components/icon";

/**
 * Die Kartenleiste über dem Studio.
 *
 * Sie sieht aus wie Browser-Reiter, und das ist Absicht: der Creator arbeitet
 * immer an genau einer Karte, und die Leiste sagt, an welcher. Welche das ist,
 * steht in der Adresse (`?karte=shop`) und nicht in einem Zustand — so
 * überlebt die Auswahl das Speichern, den Zurück-Knopf und einen geteilten
 * Link ins eigene Studio.
 *
 * Zwei Dinge sind bewusst hier und nicht in einem Menü versteckt: dass eine
 * Karte unsichtbar ist (durchgestrichener Punkt) und dass man eine neue
 * anlegen kann. Beides gehört zur Orientierung; alles Weitere — umbenennen,
 * Adresse, löschen — steckt hinter „Bearbeiten", weil man es selten braucht.
 */

export interface CardTab {
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  isVisible: boolean;
  blockCount: number;
}

export function CardBar({
  cards,
  activeId,
  basePath,
  pageTab,
}: {
  cards: CardTab[];
  /** Leer heißt: der „Seite"-Reiter ist aktiv, keine Karte. */
  activeId: string;
  /** „/studio" oder „/studio/design" — die Auswahl bleibt beim Tabwechsel. */
  basePath: string;
  /**
   * Nur im Design: ein Reiter vor allen Karten, der die Grundgestaltung meint.
   * Ohne ihn gäbe es keinen Ort, an dem man das Design ÄNDERT, das die Karten
   * erben — man könnte nur noch jede einzeln überschreiben.
   */
  pageTab?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState(cards);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Der Server bleibt die Wahrheit — nach jedem Speichern kommen die Karten neu
  // herein.
  const known = cards.map((card) => card.id).join();
  const mine = order.map((card) => card.id).join();
  if (known !== mine) setOrder(cards);

  const active = cards.find((card) => card.id === activeId) ?? null;

  function move(fromId: string, toId: string) {
    if (fromId === toId) return;
    const next = [...order];
    const from = next.findIndex((card) => card.id === fromId);
    const to = next.findIndex((card) => card.id === toId);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]!);
    setOrder(next);
    startTransition(() => reorderCardsAction(next.map((card) => card.id)));
  }

  return (
    <div className="mb-6">
      <div className="flex items-end gap-1 overflow-x-auto border-b border-line pb-px">
        {pageTab && (
          <Link
            href={basePath}
            aria-current={active ? undefined : "page"}
            className={`flex shrink-0 items-center gap-2 rounded-t-lg border border-b-0 px-3.5 py-2.5 text-sm transition-colors ${
              active
                ? "border-transparent text-ash hover:text-chalk"
                : "border-line bg-ink-2 font-medium text-chalk"
            }`}
          >
            {pageTab}
          </Link>
        )}
        {order.map((card) => {
          const isActive = card.id === active?.id;
          return (
            <Link
              key={card.id}
              href={`${basePath}?karte=${card.slug}`}
              draggable
              onDragStart={() => setDragId(card.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragId) move(dragId, card.id);
                setDragId(null);
              }}
              aria-current={isActive ? "page" : undefined}
              className={`group flex shrink-0 items-center gap-2 rounded-t-lg border border-b-0 px-3.5 py-2.5 text-sm transition-colors ${
                isActive
                  ? "border-line bg-ink-2 font-medium text-chalk"
                  : "border-transparent text-ash hover:text-chalk"
              }`}
            >
              {card.icon ? (
                <Icon name={card.icon} className="size-4" />
              ) : (
                <span
                  aria-hidden
                  title={card.isVisible ? undefined : "Versteckt"}
                  className={`size-1.5 shrink-0 rounded-full ${
                    card.isVisible ? "bg-signal" : "bg-ash/50"
                  }`}
                />
              )}
              {card.title}
              <span className="text-xs text-ash/70 tabular-nums">{card.blockCount}</span>
              {!card.isVisible && card.icon && (
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ash/50" />
              )}
            </Link>
          );
        })}

        <form action={addCardAction} className="shrink-0 px-1 pb-1">
          <AddButton disabled={cards.length >= 8} />
        </form>

        <button
          type="button"
          onClick={() => setEditing((was) => !was)}
          aria-expanded={editing}
          disabled={!active}
          className="ml-auto shrink-0 self-center rounded-lg px-2.5 py-1.5 text-xs text-ash transition-colors hover:text-chalk disabled:opacity-0"
        >
          {editing ? "Fertig" : "Karte bearbeiten"}
        </button>
      </div>

      {editing && active && <CardSettings card={active} canRemove={cards.length > 1} />}
    </div>
  );
}

function AddButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      title={disabled ? "Mehr als acht Karten überblickt niemand mehr." : "Karte hinzufügen"}
      className="flex size-8 items-center justify-center rounded-lg text-base leading-none text-ash transition-colors hover:bg-ink-2 hover:text-chalk disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "·" : "+"}
      <span className="sr-only">Karte hinzufügen</span>
    </button>
  );
}

function CardSettings({ card, canRemove }: { card: CardTab; canRemove: boolean }) {
  const [state, action] = useActionState(updateCardAction, EMPTY_STATE);

  return (
    <div className="rounded-b-xl border border-t-0 border-line bg-ink-2 p-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={card.id} />

        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field id={`card-title-${card.id}`} label="Beschriftung" error={state.fieldErrors?.title}>
            <Input
              id={`card-title-${card.id}`}
              name="title"
              defaultValue={card.title}
              maxLength={40}
            />
          </Field>

          <Field
            id={`card-slug-${card.id}`}
            label="Adresse"
            error={state.fieldErrors?.slug}
            hint="Der letzte Teil des Links auf diese Karte."
          >
            <Input
              id={`card-slug-${card.id}`}
              name="slug"
              defaultValue={card.slug}
              maxLength={40}
              spellCheck={false}
              aria-describedby={`card-slug-${card.id}-note`}
            />
          </Field>

          <Field id={`card-icon-${card.id}`} label="Zeichen" optional>
            <div className="w-40">
              <IconPicker name="icon" defaultValue={card.icon ?? ""} />
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Save />
          {state.notice && <span className="text-xs text-signal">{state.notice}</span>}
          {state.error && (
            <span role="alert" className="text-xs text-ember">
              {state.error}
            </span>
          )}
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <form action={toggleCardAction}>
          <input type="hidden" name="id" value={card.id} />
          <Button type="submit" tone="ghost" size="sm">
            {card.isVisible ? "Verstecken" : "Sichtbar machen"}
          </Button>
        </form>

        {canRemove && (
          <form action={deleteCardAction}>
            <input type="hidden" name="id" value={card.id} />
            <Button type="submit" tone="ghost" size="sm" className="text-ember hover:text-ember">
              Karte löschen
            </Button>
          </form>
        )}

        <p className="ml-auto text-xs text-ash">
          {card.isVisible
            ? "Sichtbar für Besucher."
            : "Nur du siehst diese Karte — sie fehlt im Stapel."}
        </p>
      </div>
    </div>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "…" : "Speichern"}
    </Button>
  );
}
