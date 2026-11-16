import { isSafeRelativePath } from "./safe-redirect";

/**
 * Rücksprungziel nach dem Beitritt: nur Pfade innerhalb dieser Community,
 * nie die Beitrittsseite selbst (sonst dreht sich der Weg im Kreis).
 */
export function isCommunityReturnPath(value: unknown, slug: string): value is string {
  if (!isSafeRelativePath(value)) return false;
  const base = `/c/${slug}`;
  const path = value.split(/[?#]/)[0]!;
  if (path !== base && !path.startsWith(`${base}/`)) return false;
  return path !== `${base}/join` && !path.startsWith(`${base}/join/`);
}
