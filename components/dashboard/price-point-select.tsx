"use client";

import { useLocale } from "next-intl";
import { Select } from "@/components/ui/field";
import {
  oneTimePriceOptions,
  subscriptionPriceOptions,
  tipPriceOptions,
} from "@/lib/apple-products";
import { formatPrice } from "@/lib/utils";
import { PLATFORM_CURRENCY } from "@/lib/currency";

type PriceKind = "oneTime" | "subscription" | "tip";

/**
 * Auswahlliste fester Apple-Preispunkte für bezahlte Inhalte. Rendert die
 * zulässigen Preispunkte als Optionen (Wert = Cents) und schickt den Betrag
 * über ein verstecktes Feld (`name`) exakt wie zuvor in Cents an die
 * Server-Action mit. Für optionale Preisfelder (`allowFree`) steht zusätzlich
 * eine „Kostenlos"-Option (0) am Anfang.
 *
 * Bearbeitung: ein bereits gespeicherter Preis (`defaultCents`), der (noch)
 * nicht auf dem Preisraster liegt, wird als Option erhalten, damit das
 * Speichern eines unveränderten Formulars den Preis nicht still ändert. Die
 * Server-Validierung bleibt die endgültige Absicherung.
 */
export function PricePointSelect({
  name,
  kind,
  defaultCents,
  required,
  allowFree,
  freeLabel = "Kostenlos",
  id,
  className,
}: {
  name: string;
  kind: PriceKind;
  defaultCents?: number;
  required?: boolean;
  allowFree?: boolean;
  freeLabel?: string;
  id?: string;
  className?: string;
}) {
  const locale = useLocale();
  const base =
    kind === "subscription"
      ? subscriptionPriceOptions(locale)
      : kind === "tip"
        ? tipPriceOptions(locale)
        : oneTimePriceOptions(locale);

  const options: { cents: number; label: string }[] = [];
  if (allowFree || !required) {
    options.push({ cents: 0, label: freeLabel });
  }
  options.push(...base);

  // Nicht-konformen Bestandspreis erhalten (Bearbeiten).
  if (
    defaultCents !== undefined &&
    defaultCents > 0 &&
    !options.some((o) => o.cents === defaultCents)
  ) {
    options.push({ cents: defaultCents, label: formatPrice(defaultCents, PLATFORM_CURRENCY, locale) });
    options.sort((a, b) => a.cents - b.cents);
  }

  const defaultValue = defaultCents !== undefined ? String(defaultCents) : undefined;

  return (
    <Select
      id={id}
      name={name}
      defaultValue={defaultValue}
      required={required}
      className={className}
    >
      {options.map((o) => (
        <option key={o.cents} value={o.cents}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
