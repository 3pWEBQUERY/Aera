"use client";

import { FONT_PAIRS, type ButtonStyle, type Corner, type FontPairKey } from "@/lib/themes";

/**
 * Auswahlfelder, die zeigen statt zu benennen.
 *
 * Vorher standen hier vier Reihen aus Textpillen: „Gefüllt · Umrandet · Weich ·
 * Milchglas", „Kantig · Leicht · Rund · Pille". Vier Reihen, die gleich
 * aussahen und deren Wirkung man erst in der Vorschau sah — die klassische
 * Bedienoberfläche, die aus einer Datenstruktur entstanden ist statt aus der
 * Frage, was jemand hier entscheidet.
 *
 * Eine Knopfform ist eine Form. Ein Eckenradius ist eine Ecke. Eine Schrift ist
 * eine Schrift. Wenn das Bedienelement selbst so aussieht, muss niemand die
 * Bezeichnung lesen — und die Bezeichnung darunter wird zur Bestätigung statt
 * zur einzigen Information.
 */

function Option({
  selected,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-w-0 flex-1 flex-col items-center gap-2 rounded-xl border px-2 py-3 transition-colors ${
        selected ? "border-signal bg-signal/5" : "border-line hover:border-ash/45"
      }`}
    >
      {children}
      <span className={`text-[0.7rem] font-medium ${selected ? "text-chalk" : "text-ash"}`}>
        {label}
      </span>
    </button>
  );
}

const BUTTON_STYLES: { key: ButtonStyle; label: string }[] = [
  { key: "solid", label: "Gefüllt" },
  { key: "outline", label: "Umrandet" },
  { key: "soft", label: "Weich" },
  { key: "glass", label: "Milchglas" },
];

export function ButtonStylePicker({
  value,
  accent,
  fg,
  surface,
  border,
  radius,
  background,
  onChange,
}: {
  value: ButtonStyle;
  accent: string;
  fg: string;
  surface: string;
  border: string;
  radius: string;
  /** Die echte Hintergrundflaeche der Seite — siehe Kommentar unten. */
  background: string;
  onChange: (value: ButtonStyle) => void;
}) {
  // Die Muster tragen die Farben des GEWÄHLTEN Looks, nicht die der App. Sonst
  // wählt man eine Form auf grünem Grund und bekommt sie auf lila geliefert.
  const preview = (style: ButtonStyle): React.CSSProperties => {
    switch (style) {
      case "outline":
        return { background: "transparent", border: `1.5px solid ${fg}`, borderRadius: radius };
      case "soft":
        return { background: surface, border: `1px solid ${border}`, borderRadius: radius };
      case "glass":
        return {
          background: `color-mix(in oklab, ${surface} 65%, transparent)`,
          border: `1px solid ${border}`,
          backdropFilter: "blur(6px)",
          borderRadius: radius,
        };
      default:
        return { background: accent, borderRadius: radius };
    }
  };

  return (
    <div className="flex gap-2">
      {BUTTON_STYLES.map((entry) => (
        <Option
          key={entry.key}
          selected={value === entry.key}
          label={entry.label}
          onClick={() => onChange(entry.key)}
        >
          {/* Das Muster steht auf der echten Hintergrundflaeche der Seite.
              Ohne sie sehen „Weich" und „Milchglas" identisch aus — beide sind
              halbdurchsichtig, und der Unterschied entsteht erst durch das,
              was durchscheint. */}
          <span
            aria-hidden
            className="flex h-9 w-full max-w-20 items-center justify-center rounded-md px-1.5"
            style={{ background }}
          >
            <span className="h-5 w-full" style={preview(entry.key)} />
          </span>
        </Option>
      ))}
    </div>
  );
}

const CORNERS: { key: Corner; label: string; radius: string }[] = [
  { key: "sharp", label: "Kantig", radius: "0px" },
  { key: "soft", label: "Leicht", radius: "5px" },
  { key: "round", label: "Rund", radius: "9px" },
  { key: "pill", label: "Pille", radius: "999px" },
];

export function CornerPicker({
  value,
  accent,
  onChange,
}: {
  value: Corner;
  accent: string;
  onChange: (value: Corner) => void;
}) {
  return (
    <div className="flex gap-2">
      {CORNERS.map((entry) => (
        <Option
          key={entry.key}
          selected={value === entry.key}
          label={entry.label}
          onClick={() => onChange(entry.key)}
        >
          <span
            aria-hidden
            className="h-6 w-full max-w-16"
            style={{ background: accent, borderRadius: entry.radius }}
          />
        </Option>
      ))}
    </div>
  );
}

export function FontPicker({
  value,
  onChange,
}: {
  value: FontPairKey;
  onChange: (value: FontPairKey) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {(Object.keys(FONT_PAIRS) as FontPairKey[]).map((key) => (
        <Option
          key={key}
          selected={value === key}
          label={FONT_PAIRS[key].label}
          onClick={() => onChange(key)}
        >
          {/* „Aa" in der Schrift selbst — der kürzestmögliche Weg, eine
              Schriftwahl zu zeigen. */}
          <span
            aria-hidden
            className="text-2xl leading-none text-chalk"
            style={{ fontFamily: FONT_PAIRS[key].display }}
          >
            Aa
          </span>
        </Option>
      ))}
    </div>
  );
}
