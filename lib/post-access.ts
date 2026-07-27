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
 * Art der Sperre — die Oberflaeche zeigt beide Faelle unterschiedlich.
 *
 * "members": der Beitrag verlangt eine Mitgliedschaft. Das Titelbild ist hier
 * die Werbung und bleibt sichtbar; nur der Inhalt haelt zurueck.
 *
 * "paid": der Beitrag wird einzeln verkauft. Das Titelbild ist Teil des
 * Gekauften und geht nicht mit — dafuer gibt es das eigens gepflegte
 * Vorschaubild (teaserUrl).
 */
export type PostLockKind = "none" | "members" | "paid";

export function postLockKind(post: GatedPost, ctx: AccessContext): PostLockKind {
  if (!isPostLocked(post, ctx)) return "none";
  return post.priceCents > 0 ? "paid" : "members";
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
