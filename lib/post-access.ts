import "server-only";
import type { Visibility } from "@/app/generated/prisma/client";
import type { AccessContext } from "./entitlements";

/**
 * Wer darf einen einzelnen Beitrag lesen?
 *
 * Der Space regelt, wer ueberhaupt hereinkommt (lib/entitlements#canAccess).
 * Innerhalb eines Space kann ein einzelner Beitrag strenger sein — und dafuer
 * gibt es zwei voneinander unabhaengige Achsen, die vorher vermischt waren:
 *
 * - `visibility`: PUBLIC / MEMBERS / PAID — wer grundsaetzlich darf.
 * - `priceCents`: > 0 heisst, der Beitrag wird einzeln verkauft.
 *
 * Beides zusammen, weil "nur fuer Mitglieder" kein Preis ist und ein
 * Einzelverkauf keine Mitgliedschaft verlangt. Frueher wurde die Sperre allein
 * aus dem Preis geschlossen, deshalb liess sich ein Beitrag nur fuer
 * Mitglieder gar nicht ausdruecken.
 */
export interface GatedPost {
  visibility: Visibility;
  priceCents: number;
  entitlementKey: string | null;
}

/** Felder, die jede Abfrage braucht, die anschliessend isPostLocked aufruft. */
export const GATE_SELECT = {
  visibility: true,
  priceCents: true,
  entitlementKey: true,
} as const;

export function isPostLocked(post: GatedPost, ctx: AccessContext): boolean {
  // Staff sieht alles — sonst koennte niemand pruefen, was er verkauft.
  if (ctx.isStaff) return false;

  // Einzelverkauf: nur der Schluessel dieses Beitrags oeffnet ihn.
  if (post.priceCents > 0) {
    return !post.entitlementKey || !ctx.keys.has(post.entitlementKey);
  }

  const isActiveMember = ctx.membership?.status === "ACTIVE";
  if (post.visibility === "MEMBERS") return !isActiveMember;
  // PAID ohne eigenen Preis: irgendein bezahlter Zugang genuegt (Tier, Kauf).
  if (post.visibility === "PAID") return !isActiveMember || !ctx.hasPaidEntitlement;
  return false;
}

/**
 * Where-Fragment fuer alles, was ausserhalb der Community sichtbar sein darf:
 * Entdecken-Suche, Sitemap, Vorschaubilder. Ein Beitrag, der eine
 * Mitgliedschaft verlangt, hat dort nichts zu suchen.
 */
export const PUBLIC_POST_WHERE = {
  visibility: "PUBLIC",
  priceCents: 0,
} as const;
