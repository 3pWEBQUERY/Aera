/**
 * Wandzeit aus `<input type="datetime-local">` ↔ absoluter Zeitpunkt.
 *
 * Das Feld kennt keine Zeitzone. Der Server (Railway: UTC) darf den Wert
 * deshalb nicht mit `new Date(wert)` lesen, sonst verschiebt sich die Zeit um
 * den Abstand zwischen Browser- und Server-Zeitzone, und zwar bei jedem
 * Speichern erneut. Der Browser schickt seinen Offset mit (Vorzeichen wie
 * `Date#getTimezoneOffset()`: Minuten, die man zur Ortszeit addiert, um UTC zu
 * erhalten; Europe/Zurich im Winter = -60), der Server rechnet damit um.
 *
 * Reine Funktionen, auf Server und Client nutzbar.
 */

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
/** Weitester Offset, den es gibt (UTC−14 … UTC+14). */
const MAX_OFFSET_MINUTES = 14 * 60;

function parseOffset(offsetMinutes: unknown): number | null {
  if (offsetMinutes === null || offsetMinutes === undefined || offsetMinutes === "") return null;
  const n = Number(offsetMinutes);
  if (!Number.isFinite(n) || Math.abs(n) > MAX_OFFSET_MINUTES) return null;
  return Math.round(n);
}

/**
 * Liest „YYYY-MM-DDTHH:mm“ als Ortszeit des Browsers mit dem mitgeschickten
 * Offset. Fehlt der Offset (alte Clients), gilt wie bisher die Zeitzone des
 * Servers. Gibt `null` zurück, wenn der Wert leer oder ungültig ist.
 */
export function parseLocalDateTime(raw: unknown, offsetMinutes: unknown): Date | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  const match = LOCAL_RE.exec(value);
  const offset = parseOffset(offsetMinutes);
  if (match && offset !== null) {
    const [, y, mo, d, h, mi, s] = match;
    const month = Number(mo);
    const day = Number(d);
    const hour = Number(h);
    const minute = Number(mi);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
    const millis =
      Date.UTC(Number(y), month - 1, day, hour, minute, Number(s ?? 0)) + offset * 60_000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Zeitpunkt → Wert für `datetime-local` in der Ortszeit mit dem gegebenen
 * Offset. Ohne Offset gilt die Zeitzone der Laufzeit (im Browser: die des
 * Nutzers, inklusive Sommerzeit am jeweiligen Datum).
 */
export function toDateTimeLocalValue(
  value: string | Date | null | undefined,
  offsetMinutes?: number,
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = offsetMinutes ?? date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

/** Offset, der für eine eingegebene Wandzeit im Browser gilt (Sommerzeit!). */
export function browserOffsetFor(localValue: string): number {
  const date = localValue ? new Date(localValue) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().getTimezoneOffset() : date.getTimezoneOffset();
}

/**
 * Datum mit Uhrzeit für Listen; das Jahr steht nur dabei, wenn es nicht das
 * aktuelle ist.
 */
export function formatWhen(
  value: string | Date,
  locale: string,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const date = new Date(value);
  const yearOf = (d: Date) =>
    Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(d));
  const otherYear = yearOf(date) !== yearOf(now);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    ...(otherYear ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
