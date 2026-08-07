"use client";

import { useId } from "react";
import {
  GRADIENT_PRESETS,
  gradientCss,
  type Background,
  type GradientStop,
  type GradientStyle,
  type TextTone,
} from "@/lib/themes";
import { ImageUpload } from "./image-upload";

/**
 * Der Hintergrund-Baukasten.
 *
 * Vier Betriebsarten, aber nur eine ist gleichzeitig sichtbar: wer ein Foto
 * hochlädt, will keine Verlaufsstopps daneben sehen. Die Umschaltung merkt
 * sich den vorherigen Zustand nicht — das wäre ein verstecktes Gedächtnis, das
 * niemand erwartet; stattdessen liefert jede Art einen sinnvollen Startwert.
 */

const KINDS: { key: Background["kind"]; label: string }[] = [
  { key: "preset", label: "Vom Look" },
  { key: "solid", label: "Farbe" },
  { key: "gradient", label: "Verlauf" },
  { key: "image", label: "Bild" },
];

const DEFAULTS: Record<Background["kind"], Background> = {
  preset: { kind: "preset" },
  solid: { kind: "solid", color: "#101426" },
  gradient: GRADIENT_PRESETS[0]!.value,
  image: { kind: "image", url: "", blur: 0, dim: 0.35 },
};

export function BackgroundEditor({
  background,
  textTone,
  onChange,
  onToneChange,
}: {
  background: Background;
  textTone: TextTone;
  onChange: (background: Background) => void;
  onToneChange: (tone: TextTone) => void;
}) {
  return (
    <div className="space-y-5">
      <Switcher active={background.kind} onSelect={(kind) => onChange(DEFAULTS[kind])} />

      {background.kind === "preset" && (
        <p className="rounded-xl border border-line bg-ink px-4 py-3 text-xs leading-relaxed text-ash">
          Der Hintergrund kommt aus dem gewählten Look. Sobald du hier etwas
          eigenes setzt, rechnen wir Schrift- und Flächenfarben neu aus, damit
          die Seite lesbar bleibt.
        </p>
      )}

      {background.kind === "solid" && (
        <SolidEditor color={background.color} onChange={(color) => onChange({ kind: "solid", color })} />
      )}

      {background.kind === "gradient" && <GradientEditor value={background} onChange={onChange} />}

      {background.kind === "image" && <ImageBackgroundEditor value={background} onChange={onChange} />}

      {background.kind !== "preset" && <ToneSwitch value={textTone} onChange={onToneChange} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Switcher({
  active,
  onSelect,
}: {
  active: Background["kind"];
  onSelect: (kind: Background["kind"]) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-xl border border-line p-1">
      {KINDS.map((entry) => (
        <button
          key={entry.key}
          type="button"
          role="tab"
          aria-selected={active === entry.key}
          onClick={() => onSelect(entry.key)}
          className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
            active === entry.key ? "bg-signal text-ink" : "text-ash hover:text-chalk"
          }`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

const SOLID_SWATCHES = [
  "#08080b", "#101426", "#12211c", "#241b12", "#2a1020",
  "#f7f5ef", "#e9e9e7", "#e6eef0", "#f3e8e2", "#eae4f6",
];

function SolidEditor({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {SOLID_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onChange(swatch)}
            aria-label={`Farbe ${swatch}`}
            aria-pressed={color.toLowerCase() === swatch}
            className={`size-8 rounded-lg border transition-transform hover:scale-110 ${
              color.toLowerCase() === swatch ? "border-signal ring-2 ring-signal/40" : "border-line"
            }`}
            style={{ background: swatch }}
          />
        ))}
      </div>
      <label htmlFor={id} className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ash transition-colors hover:text-chalk">
        <input
          id={id}
          type="color"
          value={color}
          onChange={(event) => onChange(event.target.value)}
          className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        Eigene Farbe
        <span className="font-mono text-xs">{color}</span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Gradient = Extract<Background, { kind: "gradient" }>;

const STYLES: { key: GradientStyle; label: string }[] = [
  { key: "linear", label: "Gerade" },
  { key: "radial", label: "Rund" },
  { key: "conic", label: "Fächer" },
];

function GradientEditor({ value, onChange }: { value: Gradient; onChange: (background: Gradient) => void }) {
  const angleId = useId();

  function setStop(index: number, patch: Partial<GradientStop>) {
    const stops = value.stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop));
    onChange({ ...value, stops });
  }

  return (
    <div className="space-y-4">
      {/* Die große Fläche ist die eigentliche Bedienung: hier sieht man das
          Ergebnis, nicht in einem Feld daneben. */}
      <div
        className="h-24 w-full rounded-xl border border-line"
        style={{ background: gradientCss(value) }}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-ash">Form</p>
          <div className="inline-flex gap-1 rounded-lg border border-line p-1">
            {STYLES.map((style) => (
              <button
                key={style.key}
                type="button"
                onClick={() => onChange({ ...value, style: style.key })}
                aria-pressed={value.style === style.key}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  value.style === style.key ? "bg-signal text-ink" : "text-ash hover:text-chalk"
                }`}
              >
                {style.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ein runder Verlauf hat keine Richtung — der Regler verschwindet dann,
            statt wirkungslos dazustehen. */}
        {value.style !== "radial" && (
          <div className="min-w-40 flex-1">
            <label htmlFor={angleId} className="mb-1.5 flex justify-between text-xs font-medium text-ash">
              Winkel <span className="font-mono">{value.angle}°</span>
            </label>
            <input
              id={angleId}
              type="range"
              min={0}
              max={360}
              step={5}
              value={value.angle}
              onChange={(event) => onChange({ ...value, angle: Number(event.target.value) })}
              className="w-full accent-[var(--color-signal)]"
            />
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-ash">Farbstopps</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                // Farben tauschen, Positionen behalten: aus „dunkel oben" wird
                // „dunkel unten", ohne dass sich die Verteilung ändert.
                const colors = value.stops.map((stop) => stop.color).reverse();
                onChange({
                  ...value,
                  stops: value.stops.map((stop, index) => ({ ...stop, color: colors[index]! })),
                });
              }}
              className="rounded px-2 py-1 text-xs text-ash transition-colors hover:text-chalk"
            >
              Umkehren
            </button>
            {value.stops.length < 5 && (
              <button
                type="button"
                onClick={() => {
                  // Der neue Stopp landet in der größten Lücke — dort, wo er
                  // etwas verändert, statt auf einem bestehenden zu liegen.
                  const sorted = [...value.stops].sort((a, b) => a.at - b.at);
                  let gapIndex = 0;
                  let gap = -1;
                  for (let i = 0; i < sorted.length - 1; i++) {
                    const size = sorted[i + 1]!.at - sorted[i]!.at;
                    if (size > gap) {
                      gap = size;
                      gapIndex = i;
                    }
                  }
                  const at = Math.round((sorted[gapIndex]!.at + sorted[gapIndex + 1]!.at) / 2);
                  onChange({ ...value, stops: [...sorted, { color: sorted[gapIndex]!.color, at }].sort((a, b) => a.at - b.at) });
                }}
                className="rounded px-2 py-1 text-xs text-signal transition-colors hover:text-signal-deep"
              >
                + Stopp
              </button>
            )}
          </div>
        </div>

        <ul className="space-y-2">
          {value.stops.map((stop, index) => (
            <li key={index} className="flex items-center gap-3 rounded-lg border border-line bg-ink px-2.5 py-2">
              <input
                type="color"
                value={stop.color}
                onChange={(event) => setStop(index, { color: event.target.value })}
                aria-label={`Farbe von Stopp ${index + 1}`}
                className="size-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <input
                type="range"
                min={0}
                max={100}
                value={stop.at}
                onChange={(event) => setStop(index, { at: Number(event.target.value) })}
                aria-label={`Position von Stopp ${index + 1}`}
                className="min-w-0 flex-1 accent-[var(--color-signal)]"
              />
              <span className="w-10 shrink-0 text-right font-mono text-xs text-ash">{stop.at}%</span>
              <button
                type="button"
                disabled={value.stops.length <= 2}
                onClick={() => onChange({ ...value, stops: value.stops.filter((_, i) => i !== index) })}
                aria-label={`Stopp ${index + 1} entfernen`}
                className="shrink-0 rounded px-1.5 text-ash transition-colors enabled:hover:text-ember disabled:opacity-30"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-ash">Startpunkte</p>
        <div className="flex flex-wrap gap-2">
          {GRADIENT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(preset.value)}
              title={preset.label}
              aria-label={`Verlauf ${preset.label}`}
              className="h-8 w-14 rounded-lg border border-line transition-transform hover:scale-105"
              style={{ background: gradientCss(preset.value) }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type ImageBackground = Extract<Background, { kind: "image" }>;

function ImageBackgroundEditor({
  value,
  onChange,
}: {
  value: ImageBackground;
  onChange: (background: ImageBackground) => void;
}) {
  const blurId = useId();
  const dimId = useId();

  return (
    <div className="space-y-4">
      {/* Ohne `name`: der Hintergrund wandert im Theme-JSON mit, nicht als
          eigenes Formularfeld. */}
      <ImageUpload
        label="Hintergrundbild"
        hint="Hochkant wirkt am besten. Wird auf 1200 × 2000 gebracht."
        purpose="background"
        shape="wide"
        value={value.url}
        onChange={(url) => onChange({ ...value, url })}
      />

      {value.url && (
        <>
          <Slider
            id={blurId}
            label="Unschärfe"
            value={value.blur}
            min={0}
            max={40}
            unit="px"
            hint="Ein Foto hinter Text braucht fast immer etwas davon."
            onChange={(blur) => onChange({ ...value, blur })}
          />
          <Slider
            id={dimId}
            label="Abdunkeln"
            value={Math.round(value.dim * 100)}
            min={0}
            max={85}
            unit="%"
            hint="Der zweite Hebel für Lesbarkeit."
            onChange={(dim) => onChange({ ...value, dim: dim / 100 })}
          />
        </>
      )}
    </div>
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  unit,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  hint: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-chalk">
        {label}
        <span className="font-mono text-ash">
          {value}
          {unit}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-describedby={`${id}-hint`}
        className="w-full accent-[var(--color-signal)]"
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-ash">
        {hint}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

const TONES: { key: TextTone; label: string }[] = [
  { key: "auto", label: "Automatisch" },
  { key: "light", label: "Helle Schrift" },
  { key: "dark", label: "Dunkle Schrift" },
];

function ToneSwitch({ value, onChange }: { value: TextTone; onChange: (tone: TextTone) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-chalk">Schrift auf dem Hintergrund</p>
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line p-1">
        {TONES.map((tone) => (
          <button
            key={tone.key}
            type="button"
            onClick={() => onChange(tone.key)}
            aria-pressed={value === tone.key}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              value === tone.key ? "bg-signal text-ink" : "text-ash hover:text-chalk"
            }`}
          >
            {tone.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-ash">
        „Automatisch“ rechnet die Helligkeit deiner Fläche aus. Bei einem Foto
        rät niemand richtig — dort lohnt sich der Blick in die Vorschau.
      </p>
    </div>
  );
}
