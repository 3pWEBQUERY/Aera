import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

/**
 * Zugangsschranken vor einer Seite (Passwort, Altersbestätigung, E-Mail).
 *
 * Freigeschaltet wird über ein Cookie mit einer Signatur — kein Serverzustand,
 * keine Sitzung, keine Datenbankzeile pro Besucher. Der Wert ist ein HMAC über
 * Profil-ID und Schrankenart: er lässt sich nicht raten, gilt nur für dieses
 * eine Profil, und ändert der Creator die Schranke, verfällt er von selbst.
 *
 * Was das NICHT ist: ein Schutz für vertrauliche Inhalte. Die Blöcke stehen
 * nach dem Entsperren im HTML, und wer den Link weitergibt, gibt auch das
 * Cookie-Rezept weiter. Es ist eine Tür, kein Tresor — und für „nur für
 * Newsletter-Abonnenten“ oder „18+“ ist genau das die richtige Bauweise.
 */

const COOKIE_PREFIX = "aeli_gate_";
const MAX_AGE = 60 * 60 * 24 * 30;

function token(profileId: string, gate: string): string {
  return createHmac("sha256", env.AELI_AUTH_SECRET)
    .update(`gate|${profileId}|${gate}`)
    .digest("base64url");
}

export async function isUnlocked(profileId: string, gate: string): Promise<boolean> {
  if (gate === "NONE") return true;
  const value = (await cookies()).get(`${COOKIE_PREFIX}${profileId}`)?.value;
  if (!value) return false;
  const expected = token(profileId, gate);
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function unlock(profileId: string, gate: string): Promise<void> {
  (await cookies()).set(`${COOKIE_PREFIX}${profileId}`, token(profileId, gate), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}
