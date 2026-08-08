"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateBlockAction } from "@/app/actions/profile";
import { EMPTY_STATE } from "@/lib/action-state";
import { blockDescriptor } from "@/lib/blocks";
import { EMBED_PROVIDERS } from "@/lib/embed";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ScheduleFields } from "./schedule-fields";
import type { StudioBlock } from "./types";

/**
 * Das aufgeklappte Formular eines Blocks.
 *
 * Es zeigt nur die Felder, die der jeweilige Typ auch liest. Ein Trenner hat
 * keinen Titel, ein Bild kein Ziel, eine Überschrift keinen Zeitplan — jedes
 * Feld, das nichts bewirkt, wäre eine Frage, auf die es keine richtige Antwort
 * gibt.
 */
export function BlockEditor({ block, onDone }: { block: StudioBlock; onDone: () => void }) {
  const [state, action] = useActionState(updateBlockAction, EMPTY_STATE);
  const descriptor = blockDescriptor(block.type);
  const errors = state.fieldErrors ?? {};

  const has = (field: EditorField) => FIELDS[block.type].includes(field);

  return (
    <form action={action} className="space-y-5 border-t border-line px-4 py-5">
      <input type="hidden" name="id" value={block.id} />

      {state.error && (
        <p role="alert" className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-xs text-ember">
          {state.error}
        </p>
      )}

      {has("title") && (
        <Field
          id={`title-${block.id}`}
          label={block.type === "TEXT" ? "Text" : block.type === "HEADER" ? "Überschrift" : "Titel"}
        >
          {block.type === "TEXT" ? (
            <Textarea id={`title-${block.id}`} name="title" defaultValue={block.title ?? ""} rows={3} />
          ) : (
            <Input
              id={`title-${block.id}`}
              name="title"
              defaultValue={block.title ?? ""}
              placeholder={descriptor.defaults.title}
            />
          )}
        </Field>
      )}

      {has("subtitle") && (
        <Field id={`subtitle-${block.id}`} label="Untertitel" optional>
          <Input id={`subtitle-${block.id}`} name="subtitle" defaultValue={block.subtitle ?? ""} />
        </Field>
      )}

      {has("href") && (
        <Field
          id={`href-${block.id}`}
          label="Ziel"
          error={errors.href}
          hint="Adresse ohne https:// reicht. Auch mailto: und tel: gehen."
        >
          <Input
            id={`href-${block.id}`}
            name="href"
            defaultValue={block.href ?? ""}
            inputMode="url"
            placeholder="example.com/deine-seite"
            aria-invalid={Boolean(errors.href)}
            aria-describedby={`href-${block.id}-note`}
          />
        </Field>
      )}

      {has("embed") && (
        <Field
          id={`embed-${block.id}`}
          label="Adresse zum Einbetten"
          hint={`Unterstützt: ${EMBED_PROVIDERS.join(", ")}. Andere Adressen werden als normaler Link angezeigt.`}
        >
          <Input
            id={`embed-${block.id}`}
            name="embedUrl"
            defaultValue={block.config.embedUrl ?? ""}
            inputMode="url"
            placeholder="youtube.com/watch?v=…"
            aria-describedby={`embed-${block.id}-note`}
          />
        </Field>
      )}

      {has("media") && (
        <Field id={`media-${block.id}`} label="Bildadresse" optional hint="Direkter Link auf eine Bilddatei (jpg, png, webp).">
          <Input
            id={`media-${block.id}`}
            name="mediaUrl"
            defaultValue={block.mediaUrl ?? ""}
            inputMode="url"
            aria-describedby={`media-${block.id}-note`}
          />
        </Field>
      )}

      {has("alt") && (
        <Field
          id={`alt-${block.id}`}
          label="Bildbeschreibung"
          hint="Was ist zu sehen? Wird vorgelesen und steht da, wenn das Bild nicht lädt."
        >
          <Input
            id={`alt-${block.id}`}
            name="alt"
            defaultValue={block.config.alt ?? ""}
            aria-describedby={`alt-${block.id}-note`}
          />
        </Field>
      )}

      {has("decor") && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={`icon-${block.id}`} label="Emoji" optional>
            <Input
              id={`icon-${block.id}`}
              name="icon"
              defaultValue={block.icon ?? ""}
              maxLength={4}
              placeholder="🎧"
              className="text-center text-lg"
            />
          </Field>
          <Field id={`badge-${block.id}`} label="Etikett" optional>
            <Input
              id={`badge-${block.id}`}
              name="badge"
              defaultValue={block.config.badge ?? ""}
              maxLength={24}
              placeholder="neu"
            />
          </Field>
          <Field id={`thumb-${block.id}`} label="Vorschaubild" optional>
            <Input
              id={`thumb-${block.id}`}
              name="thumbnailUrl"
              defaultValue={block.config.thumbnailUrl ?? ""}
              inputMode="url"
            />
          </Field>
        </div>
      )}

      {has("price") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`price-${block.id}`} label="Preis" optional hint="Zum Beispiel 19,90">
            <Input
              id={`price-${block.id}`}
              name="price"
              defaultValue={
                typeof block.config.priceCents === "number"
                  ? (block.config.priceCents / 100).toFixed(2).replace(".", ",")
                  : ""
              }
              inputMode="decimal"
              aria-describedby={`price-${block.id}-note`}
            />
          </Field>
          <Field id={`currency-${block.id}`} label="Währung" optional>
            <Input
              id={`currency-${block.id}`}
              name="currency"
              defaultValue={block.config.currency ?? "EUR"}
              maxLength={3}
              className="uppercase"
            />
          </Field>
        </div>
      )}

      {has("amounts") && (
        <Field
          id={`amounts-${block.id}`}
          label="Vorschlagsbeträge"
          optional
          hint="Durch Komma getrennt, z. B. 3, 5, 10. Höchstens vier."
        >
          <Input
            id={`amounts-${block.id}`}
            name="amounts"
            defaultValue={(block.config.amounts ?? []).map((cents) => cents / 100).join(", ")}
            aria-describedby={`amounts-${block.id}-note`}
          />
        </Field>
      )}

      {has("form") && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`button-${block.id}`} label="Knopfbeschriftung" optional>
              <Input
                id={`button-${block.id}`}
                name="buttonLabel"
                defaultValue={block.config.buttonLabel ?? ""}
                maxLength={40}
                placeholder={block.type === "NEWSLETTER" ? "Eintragen" : "Absenden"}
              />
            </Field>
            <Field id={`success-${block.id}`} label="Bestätigung" optional>
              <Input
                id={`success-${block.id}`}
                name="successMessage"
                defaultValue={block.config.successMessage ?? ""}
                maxLength={200}
                placeholder="Danke!"
              />
            </Field>
          </div>
          {block.type === "CONTACT" && (
            <Checkbox
              name="withMessage"
              defaultChecked={block.config.withMessage !== false}
              label="Nachrichtenfeld anzeigen"
            />
          )}
        </div>
      )}

      {has("cta") && (
        <Field id={`cta-${block.id}`} label="Knopfbeschriftung" optional>
          <Input
            id={`cta-${block.id}`}
            name="ctaLabel"
            defaultValue={block.config.ctaLabel ?? ""}
            maxLength={40}
            placeholder="Community beitreten"
          />
        </Field>
      )}

      {has("limit") && (
        <Field
          id={`limit-${block.id}`}
          label="Wie viele Einträge"
          optional
          hint="Höchstens sechs. Leer bedeutet drei — genug, um etwas zu zeigen, wenig genug, um nicht die Seite zu übernehmen."
        >
          <Input
            id={`limit-${block.id}`}
            name="limit"
            type="number"
            min={1}
            max={6}
            defaultValue={block.config.limit ?? ""}
            className="max-w-24"
            aria-describedby={`limit-${block.id}-note`}
          />
        </Field>
      )}

      {has("highlight") && (
        <Checkbox
          name="highlight"
          defaultChecked={block.config.highlight === true}
          label="Hervorheben"
          hint="Ein Akzentrahmen. Wirkt nur, solange es der einzige hervorgehobene Block ist."
        />
      )}

      {has("schedule") && <ScheduleFields startsAt={block.startsAt} endsAt={block.endsAt} />}

      <div className="flex items-center gap-2 pt-1">
        <Save />
        <Button type="button" tone="ghost" size="sm" onClick={onDone}>
          Schließen
        </Button>
        {state.notice && <span className="text-xs text-signal">{state.notice}</span>}
      </div>
    </form>
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

function Checkbox({
  name,
  defaultChecked,
  label,
  hint,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-chalk">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-signal)]"
      />
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-xs text-ash">{hint}</span>}
      </span>
    </label>
  );
}

type EditorField =
  | "title"
  | "subtitle"
  | "href"
  | "embed"
  | "media"
  | "alt"
  | "decor"
  | "price"
  | "amounts"
  | "form"
  | "cta"
  | "highlight"
  | "limit"
  | "schedule";

/**
 * Welcher Typ welche Felder zeigt.
 *
 * Diese Tabelle ist der Grund, warum der Editor nicht in fünfzehn Dateien
 * zerfällt: die Formularteile sind für alle Typen dieselben, nur ihre Auswahl
 * unterscheidet sich. Ein neuer Blocktyp braucht hier eine Zeile.
 */
const FIELDS: Record<StudioBlock["type"], EditorField[]> = {
  LINK: ["title", "subtitle", "href", "decor", "highlight", "schedule"],
  HEADER: ["title"],
  TEXT: ["title"],
  DIVIDER: [],
  SOCIAL_ROW: ["schedule"],
  IMAGE: ["title", "media", "alt", "href", "schedule"],
  EMBED: ["title", "embed", "schedule"],
  MUSIC: ["title", "embed", "schedule"],
  NEWSLETTER: ["title", "subtitle", "form", "schedule"],
  CONTACT: ["title", "subtitle", "form", "schedule"],
  QR_SHARE: ["title"],
  TIP: ["title", "subtitle", "href", "amounts", "decor", "schedule"],
  PRODUCT: ["title", "subtitle", "href", "media", "price", "schedule"],
  BOOKING: ["title", "subtitle", "href", "decor", "schedule"],
  COMMUNITY_CTA: ["title", "subtitle", "cta", "schedule"],
  LIVE_NOW: ["title"],
  // Die AERA_*-Bausteine haben keinen Inhalt zum Bearbeiten. Zu setzen gibt es
  // nur die Überschrift, wie viele Einträge erscheinen — und wann.
  AERA_EVENTS: ["title", "limit", "schedule"],
  AERA_TIERS: ["title", "limit", "schedule"],
  AERA_SHOP: ["title", "limit", "schedule"],
  AERA_COURSES: ["title", "limit", "schedule"],
  AERA_SPACES: ["title", "limit", "schedule"],
};
