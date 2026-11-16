"use client";

import { useLocale, useTranslations } from "next-intl";
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
 *
 * Ohne `defaultCents`, aber mit `placeholder`, ist nichts vorausgewählt —
 * auch „Kostenlos" nicht. Das Feld sendet dann einen leeren Wert, und das
 * Formular muss die Auswahl selbst einfordern (Fehler am Feld).
 *
 * Alle Beträge sind in der Plattformwährung (`PLATFORM_CURRENCY`) — genau so
 * speichert der Server sie auch.
 */
export function PricePointSelect({
  name,
  kind,
  defaultCents,
  required,
  allowFree,
  freeLabel,
  placeholder,
  onChange,
  id,
  className,
}: {
  name: string;
  kind: PriceKind;
  defaultCents?: number;
  required?: boolean;
  allowFree?: boolean;
  freeLabel?: string;
  /** Text bei fehlender Auswahl; zusammen ohne `defaultCents` = keine Vorauswahl. */
  placeholder?: string;
  /** Gewählter Betrag in Cents als String ("" = keine Auswahl). */
  onChange?: (value: string) => void;
  id?: string;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("ui.pricePoint");
  const base =
    kind === "subscription"
      ? subscriptionPriceOptions(locale, PLATFORM_CURRENCY)
      : kind === "tip"
        ? tipPriceOptions(locale, PLATFORM_CURRENCY)
        : oneTimePriceOptions(locale, PLATFORM_CURRENCY);

  const options: { cents: number; label: string }[] = [];
  if (allowFree || !required) {
    options.push({ cents: 0, label: freeLabel ?? t("free") });
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

  const defaultValue =
    defaultCents !== undefined ? String(defaultCents) : placeholder ? "" : undefined;

  return (
    <Select
      id={id}
      name={name}
      defaultValue={defaultValue}
      required={required}
      placeholder={placeholder}
      onChange={onChange}
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
