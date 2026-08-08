"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  linkTenantAction,
  redeemLinkCodeAction,
  updateGateAction,
  updateHandleAction,
  updatePageOptionsAction,
  updateSeoAction,
} from "@/app/actions/profile";
import { EMPTY_STATE } from "@/lib/action-state";
import { normalizeHandle } from "@/lib/handle";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ImageUpload } from "./image-upload";
import type { AeliGate } from "@/app/generated/prisma/client";

function SaveRow({ label, notice, error }: { label: string; notice?: string; error?: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-3 pt-1">
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "…" : label}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-ember">
          {error}
        </span>
      ) : notice ? (
        <span className="text-xs text-signal">{notice}</span>
      ) : null}
    </div>
  );
}

/**
 * Die Adresse ändern.
 *
 * Der Hinweis darunter ist kein Kleingedrucktes: der Handle steht in fremden
 * Bios, auf gedruckten Karten und in QR-Codes, die niemand zurückrufen kann.
 * Wer ihn ändert, soll das wissen, bevor er speichert — nicht danach.
 */
/**
 * Der Handle — und damit die Adresse.
 *
 * `url` kommt zerlegt vom Server (`profileUrlLabelParts`), statt hier aus
 * einem Suffix zusammengebaut zu werden. Genau das war vorher der Fehler: das
 * Formular versprach `marie.aeli.so`, während Kopfzeile, QR-Code und
 * Teilen-Knopf `localhost:3001/p/marie` nannten. Der Handle änderte sich
 * durchaus — nur die Adresse, die hier stand, gab es nicht.
 */
export function HandleForm({
  handle,
  url,
}: {
  handle: string;
  url: { prefix: string; suffix: string };
}) {
  const [state, action] = useActionState(updateHandleAction, EMPTY_STATE);
  const [value, setValue] = useState(handle);
  const address = (name: string) => `${url.prefix}${name}${url.suffix}`;

  // Nach einer erfolgreichen Änderung lädt der Server die Seite neu und
  // `handle` trägt den neuen Wert. Bis dahin ist `value` das, was im Feld
  // steht — beide auseinanderzuhalten ist der ganze Sinn der Warnung unten.
  const changed = value !== handle;

  return (
    <form action={action} className="space-y-4">
      <Field
        id="handle"
        label="Handle"
        error={state.fieldErrors?.handle}
        hint={
          value
            ? `${changed ? "Deine Seite liegt dann auf" : "Deine Seite liegt auf"} ${address(value)}`
            : "Ohne Handle gibt es keine Adresse."
        }
      >
        <Input
          id="handle"
          name="handle"
          value={value}
          onChange={(event) => setValue(normalizeHandle(event.target.value))}
          maxLength={30}
          spellCheck={false}
          aria-describedby="handle-note"
        />
      </Field>

      {changed && (
        <p className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-xs text-ember">
          Die alte Adresse <span className="font-medium">{address(handle)}</span> führt danach ins
          Leere. Links, die andere schon gesetzt haben, funktionieren nicht mehr.
        </p>
      )}

      <SaveRow label="Handle ändern" notice={state.notice} error={state.error} />
    </form>
  );
}

export function SeoForm({
  seoTitle,
  seoDescription,
  seoImageUrl,
  seoNoindex,
  fallbackTitle,
}: {
  seoTitle: string;
  seoDescription: string;
  seoImageUrl: string;
  seoNoindex: boolean;
  fallbackTitle: string;
}) {
  const [state, action] = useActionState(updateSeoAction, EMPTY_STATE);
  const [image, setImage] = useState(seoImageUrl);

  return (
    <form action={action} className="space-y-4">
      <Field
        id="seoTitle"
        label="Titel in Suche und Vorschau"
        optional
        hint={`Leer heißt: „${fallbackTitle}“.`}
      >
        <Input
          id="seoTitle"
          name="seoTitle"
          defaultValue={seoTitle}
          maxLength={70}
          aria-describedby="seoTitle-note"
        />
      </Field>

      <Field
        id="seoDescription"
        label="Beschreibung"
        optional
        hint="Rund 150 Zeichen. Steht unter dem Titel, wenn jemand deine Seite teilt."
      >
        <Textarea
          id="seoDescription"
          name="seoDescription"
          defaultValue={seoDescription}
          maxLength={200}
          rows={2}
          aria-describedby="seoDescription-note"
        />
      </Field>

      {/* Hochgeladen wird sofort in den Bucket, übernommen erst mit
          „Speichern“ — dieselbe Trennung wie beim Profilbild. */}
      <ImageUpload
        name="seoImageUrl"
        label="Vorschaubild"
        hint="Wird auf 1200 × 630 gebracht — das Format, das WhatsApp, Slack und X erwarten. Ohne eigenes Bild zeichnen wir eine Karte aus deinem Namen und deinen Farben."
        purpose="social"
        shape="wide"
        value={image}
        onChange={setImage}
      />

      <label className="flex cursor-pointer items-start gap-3 text-sm text-chalk">
        <input
          type="checkbox"
          name="seoNoindex"
          defaultChecked={seoNoindex}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-signal)]"
        />
        <span>
          Aus Suchmaschinen heraushalten
          <span className="mt-0.5 block text-xs text-ash">
            Die Seite bleibt erreichbar — sie taucht nur nicht in Ergebnissen auf.
          </span>
        </span>
      </label>

      <SaveRow label="Speichern" notice={state.notice} error={state.error} />
    </form>
  );
}

export function OptionsForm({
  smartSort,
  showBranding,
}: {
  smartSort: boolean;
  showBranding: boolean;
}) {
  const [state, action] = useActionState(updatePageOptionsAction, EMPTY_STATE);

  return (
    <form action={action} className="space-y-4">
      <label className="flex cursor-pointer items-start gap-3 text-sm text-chalk">
        <input
          type="checkbox"
          name="smartSort"
          defaultChecked={smartSort}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-signal)]"
        />
        <span>
          Meistgeklickt nach oben
          <span className="mt-0.5 block text-xs text-ash">
            Sortiert nur die Links untereinander um. Überschriften, Trenner und Einbettungen
            bleiben, wo du sie hingestellt hast.
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 text-sm text-chalk">
        <input
          type="checkbox"
          name="showBranding"
          defaultChecked={showBranding}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-signal)]"
        />
        <span>
          „Erstellt mit aeli“ im Fuß zeigen
          <span className="mt-0.5 block text-xs text-ash">
            Kostet dich nichts und bringt uns die Leute, die fragen, womit deine Seite gemacht ist.
          </span>
        </span>
      </label>

      <SaveRow label="Speichern" notice={state.notice} error={state.error} />
    </form>
  );
}

const GATES: { key: AeliGate; label: string; hint: string }[] = [
  { key: "NONE", label: "Offen", hint: "Jeder sieht die Seite sofort." },
  { key: "PASSWORD", label: "Passwort", hint: "Nur wer das Passwort kennt, kommt rein." },
  { key: "AGE", label: "Altersabfrage", hint: "Eine Bestätigung „18 oder älter“ vor dem ersten Blick." },
  { key: "EMAIL", label: "E-Mail", hint: "Adresse eintragen, dann geht es weiter. Landet bei deinen Kontakten." },
];

export function GateForm({ gate, hasPassword }: { gate: AeliGate; hasPassword: boolean }) {
  const [state, action] = useActionState(updateGateAction, EMPTY_STATE);
  const [selected, setSelected] = useState<AeliGate>(gate);

  return (
    <form action={action} className="space-y-4">
      <Field id="gate" label="Zugang">
        <Select
          id="gate"
          name="gate"
          value={selected}
          onChange={(event) => setSelected(event.target.value as AeliGate)}
        >
          {GATES.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </Select>
      </Field>

      <p className="text-xs text-ash">{GATES.find((entry) => entry.key === selected)?.hint}</p>

      {selected === "PASSWORD" && (
        <Field
          id="gatePassword"
          label={hasPassword ? "Neues Passwort" : "Passwort"}
          error={state.fieldErrors?.gatePassword}
          hint={hasPassword ? "Leer lassen heißt: bleibt wie es ist." : undefined}
        >
          <Input
            id="gatePassword"
            name="gatePassword"
            type="password"
            autoComplete="new-password"
            aria-describedby="gatePassword-note"
          />
        </Field>
      )}

      <p className="rounded-lg border border-line px-3 py-2 text-xs text-ash">
        Eine Tür, kein Tresor: wer einmal drin ist, kann alles sehen und weitergeben. Für „nur für
        Abonnenten“ und „18+“ genau richtig — für Vertrauliches nicht.
      </p>

      <SaveRow label="Zugang speichern" notice={state.notice} error={state.error} />
    </form>
  );
}

export function CommunityForm({
  tenants,
  linkedTenantId,
  linkedTenantName,
}: {
  tenants: { id: string; name: string }[];
  linkedTenantId: string | null;
  linkedTenantName: string | null;
}) {
  const [state, action] = useActionState(linkTenantAction, EMPTY_STATE);

  return (
    <div className="space-y-6">
      {linkedTenantName && (
        <p className="rounded-lg border border-line bg-ink px-3 py-2.5 text-sm text-chalk">
          Verknüpft mit <span className="font-medium">{linkedTenantName}</span>. Die Bausteine
          „Community beitreten“ und „Jetzt live“ stehen im Baukasten bereit.
        </p>
      )}

      {tenants.length > 0 ? (
        <form action={action} className="space-y-4">
          <Field
            id="tenantId"
            label="Eigene Community"
            hint="Communities, die diesem Konto gehören."
          >
            <Select
              id="tenantId"
              name="tenantId"
              defaultValue={linkedTenantId ?? ""}
              aria-describedby="tenantId-note"
            >
              <option value="">Keine</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </Select>
          </Field>

          <SaveRow label="Verknüpfung speichern" notice={state.notice} error={state.error} />
        </form>
      ) : (
        <p className="text-sm text-ash">
          Dieses Konto besitzt keine Aera-Community. Wenn deine Community unter einer anderen
          E-Mail läuft, hol dir dort einen Verbindungscode — das Feld dafür steht darunter.
        </p>
      )}

      <RedeemCodeForm />
    </div>
  );
}

/**
 * Der Weg für eine Community, die einem ANDEREN Konto gehört.
 *
 * Die Auswahl darüber kennt nur eigene Communities — sie muss das auch, sonst
 * könnte man sich an fremde hängen. Wer beide Seiten besitzt, aber unter zwei
 * E-Mails, holt sich in Aera einen befristeten Code und fügt ihn hier ein.
 */
function RedeemCodeForm() {
  const [state, action] = useActionState(redeemLinkCodeAction, EMPTY_STATE);

  return (
    <form action={action} className="space-y-3 border-t border-line pt-5">
      <Field
        id="code"
        label="Verbindungscode einlösen"
        error={state.fieldErrors?.code}
        hint="Aus dem Aera-Dashboard: Einstellungen → Integrationen → „Meine Aeli-Seite läuft unter einer anderen E-Mail“."
      >
        <Input
          id="code"
          name="code"
          placeholder="AELI1.…"
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-xs"
          aria-describedby="code-note"
        />
      </Field>

      <SaveRow label="Code einlösen" notice={state.notice} error={state.error} />
    </form>
  );
}
