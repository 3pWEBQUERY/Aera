// Drip-Content: Lektionen werden N Tage nach Community-Beitritt freigeschaltet.
// Bewusst ohne "server-only": reine Datums-Logik, auch im Client nutzbar.

const DAY_MS = 86_400_000;

/** Zeitpunkt, ab dem die Lektion für dieses Mitglied verfügbar ist. */
export function lessonAvailableAt(
  joinedAt: Date,
  dripAfterDays: number | null | undefined,
): Date {
  const days = dripAfterDays ?? 0;
  if (days <= 0) return joinedAt;
  return new Date(joinedAt.getTime() + days * DAY_MS);
}

/**
 * Ist die Lektion freigeschaltet?
 * Ohne Drip (null/0): immer. Mit Drip: erst ab joinedAt + N Tage;
 * ohne Mitgliedschaft (joinedAt null) bleibt gedrippter Inhalt gesperrt.
 */
export function isLessonUnlocked(
  joinedAt: Date | null | undefined,
  dripAfterDays: number | null | undefined,
  now: Date = new Date(),
): boolean {
  const days = dripAfterDays ?? 0;
  if (days <= 0) return true;
  if (!joinedAt) return false;
  return now >= lessonAvailableAt(joinedAt, days);
}

/** Verbleibende volle Tage bis zur Freischaltung (für die UI). */
export function daysUntilUnlock(
  joinedAt: Date,
  dripAfterDays: number,
  now: Date = new Date(),
): number {
  const at = lessonAvailableAt(joinedAt, dripAfterDays);
  return Math.max(0, Math.ceil((at.getTime() - now.getTime()) / DAY_MS));
}
