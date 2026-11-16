"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input, Label } from "@/components/ui/field";
import { browserOffsetFor, formatWhen, toDateTimeLocalValue } from "@/lib/local-datetime";

const noopSubscribe = () => () => {};

/** true erst im Browser; beim Server-Rendern und während der Hydration false. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Datum und Uhrzeit in der Zeitzone des Betrachters. Der Server kennt sie
 * nicht (er rendert in UTC), deshalb erscheint der Text erst im Browser.
 */
export function ClientWhen({ value }: { value: string | Date }) {
  const locale = useLocale();
  const isClient = useIsClient();
  if (!isClient) return null;
  return <time dateTime={new Date(value).toISOString()}>{formatWhen(value, locale)}</time>;
}

function timeZoneLabel(locale: string, localValue: string): { zone: string; abbr: string } {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const at = localValue ? new Date(localValue) : new Date();
  const date = Number.isNaN(at.getTime()) ? new Date() : at;
  const abbr =
    new Intl.DateTimeFormat(locale, { timeZoneName: "short" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return { zone, abbr };
}

/**
 * `datetime-local` mit allem, was der Server zum richtigen Umrechnen braucht:
 * schickt den Offset des Browsers für das gewählte Datum als `offsetName`
 * mit, nennt die Zeitzone am Feld und warnt (ohne zu blockieren), wenn der
 * Zeitpunkt in der Vergangenheit liegt.
 *
 * Nur in Client-Oberflächen wie Sheets einsetzen: Der Startwert hängt von der
 * Zeitzone des Browsers ab.
 */
export function LocalDateTimeField({
  id,
  name,
  label,
  defaultValue,
  required,
  offsetName = "timezoneOffset",
  pastWarning,
  hint,
  onValueChange,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | Date | null;
  required?: boolean;
  offsetName?: string;
  /** Eigener Warntext; Standard „Dieses Datum liegt in der Vergangenheit.“ */
  pastWarning?: string;
  /** Zusätzlicher Hinweis unter dem Feld. */
  hint?: string;
  onValueChange?: (value: string) => void;
}) {
  const t = useTranslations("dashboard.dateTimeField");
  const locale = useLocale();
  const isClient = useIsClient();
  const [value, setValue] = useState(() => toDateTimeLocalValue(defaultValue));
  const hintId = useId();
  const warnId = useId();

  const picked = value ? new Date(value) : null;
  const inPast = !!picked && !Number.isNaN(picked.getTime()) && picked.getTime() < Date.now();
  const tz = isClient ? timeZoneLabel(locale, value) : null;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={offsetName} value={isClient ? browserOffsetFor(value) : ""} />
      <Input
        id={id}
        name={name}
        type="datetime-local"
        required={required}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onValueChange?.(e.target.value);
        }}
        aria-describedby={[hintId, inPast ? warnId : null].filter(Boolean).join(" ")}
      />
      <p id={hintId} className="mt-1 text-xs text-slate-500">
        {tz ? t("tzHint", { zone: tz.zone, abbr: tz.abbr }) : null}
        {hint ? <span className="block">{hint}</span> : null}
      </p>
      {inPast && (
        <p id={warnId} className="mt-1 text-xs font-medium text-amber-700">
          {pastWarning ?? t("pastWarning")}
        </p>
      )}
    </div>
  );
}
