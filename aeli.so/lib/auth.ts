import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import bcrypt from "bcryptjs";
import {
  authLookup,
  consumeRecoveryCodeHash,
  endSessions,
  registerUserRow,
  sessionUser,
} from "./db-functions";
import { getSession, setSessionCookie, type SessionPayload } from "./session";
import { hashRecoveryCode, looksLikeRecoveryCode } from "./totp-recovery";

/**
 * Aeli und Aera teilen sich die `User`-Tabelle: ein Konto, zwei Produkte.
 * Wer auf aera.so registriert ist, meldet sich hier mit denselben Zugangsdaten
 * an — ohne zweites Passwort und ohne Kontoabgleich.
 *
 * `aeli_app` hat auf `User` bewusst keinerlei Rechte (siehe Migration
 * 20260807120000_aeli_link_in_bio). Anmeldung und Registrierung laufen deshalb
 * über drei eng geschnittene Datenbankfunktionen (lib/db-functions.ts), die
 * jeweils nur die Spalten herausgeben, die dieser Schritt braucht.
 */

/** Was Aeli von einem Konto weiß — bewusst ohne Hashes und Geheimnisse. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/** Kostenfaktor 12, identisch zu Aera — sonst waeren die Hashes inkompatibel. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Muss zu Aeras lib/legal.ts passen: beide Produkte laufen unter denselben
// Bedingungen, also darf hier keine eigene Versionszaehlung entstehen.
const CURRENT_TERMS_VERSION = "2026-07-19";
const CURRENT_PRIVACY_VERSION = "2026-07-19";

export type RegisterResult =
  | { ok: true; userId: string }
  | { ok: false; error: "emailAlreadyRegistered" | "invalidInput" };

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name || input.password.length < 10) return { ok: false, error: "invalidInput" };

  // Zustimmung wird beim Anlegen belegt, nicht spaeter behauptet — die
  // Funktion schreibt Konto und Nachweis (Quelle „AELI_SIGNUP“) zusammen.
  // Ob die Adresse frei ist, entscheidet der Unique-Index in der Funktion,
  // nicht ein vorheriges SELECT.
  const created = await registerUserRow({
    id: `c${randomUUID().replaceAll("-", "")}`,
    email,
    name,
    passwordHash: await hashPassword(input.password),
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
  });
  if (!created) return { ok: false, error: "emailAlreadyRegistered" };

  await setSessionCookie({
    userId: created.id,
    sessionVersion: created.sessionVersion,
    aeliSessionVersion: 0,
  });
  return { ok: true, userId: created.id };
}

export type AuthError =
  | "invalidCredentials"
  | "totpCodeInvalid"
  | "recoveryCodeInvalid"
  | "totpUnavailable";

export type AuthResult =
  | { ok: true; userId: string; usedRecoveryCode: boolean; recoveryCodesLeft: number | null }
  | { ok: false; error?: AuthError; needsTotp?: boolean };

/**
 * Passwort prüfen, dann — falls eingerichtet — den zweiten Faktor.
 *
 * Der zweite Faktor ist entweder ein 6-stelliger Code aus der App oder ein
 * Wiederherstellungscode („abcd-2345-efgh“). Welcher es ist, entscheidet die
 * Form der Eingabe; ein Wiederherstellungscode wird dabei verbraucht.
 */
export async function authenticate(email: string, password: string, secondFactor?: string): Promise<AuthResult> {
  const user = await authLookup(email.trim().toLowerCase());

  // Bewusst dieselbe Antwort fuer „kein Konto“ und „falsches Passwort“: sonst
  // wird die Anmeldemaske zum Verzeichnis, in dem man E-Mail-Adressen abfragt.
  if (!user || user.accountStatus !== "ACTIVE") return { ok: false, error: "invalidCredentials" };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "invalidCredentials" };
  }

  let usedRecoveryCode = false;
  let recoveryCodesLeft: number | null = null;

  // Zwei-Faktor erst nach korrektem Passwort abfragen, sonst verraet allein die
  // Code-Abfrage, dass es dieses Konto gibt.
  if (user.totpEnabledAt && user.totpSecret) {
    const code = secondFactor?.trim() ?? "";
    if (!code) return { ok: false, needsTotp: true };

    if (looksLikeRecoveryCode(code)) {
      const left = await consumeRecoveryCodeHash(user.id, hashRecoveryCode(user.id, code));
      if (left < 0) return { ok: false, needsTotp: true, error: "recoveryCodeInvalid" };
      usedRecoveryCode = true;
      recoveryCodesLeft = left;
    } else {
      const [{ decryptSecret }, { verifyTotp }] = await Promise.all([
        import("./secret-encryption"),
        import("./totp"),
      ]);
      let secret: string;
      try {
        secret = decryptSecret(user.totpSecret);
      } catch (error) {
        // Ohne Schluesselbund kann Aeli den Code nicht pruefen. Das ist ein
        // Konfigurationsfehler, kein falscher Code — und niemand soll deshalb
        // glauben, sein Authenticator sei kaputt. Ein Wiederherstellungscode
        // funktioniert in diesem Fall trotzdem.
        console.error(`[aeli] TOTP-Geheimnis nicht lesbar (User ${user.id}):`, error);
        return { ok: false, needsTotp: true, error: "totpUnavailable" };
      }
      if (!verifyTotp(secret, code)) return { ok: false, needsTotp: true, error: "totpCodeInvalid" };
    }
  }

  await setSessionCookie({
    userId: user.id,
    sessionVersion: user.sessionVersion,
    aeliSessionVersion: user.aeliSessionVersion,
  });
  return { ok: true, userId: user.id, usedRecoveryCode, recoveryCodesLeft };
}

/**
 * Abmelden heißt hier: alle Aeli-Sitzungen dieses Kontos entwerten, nicht nur
 * das Cookie in diesem Browser löschen. Ein kopiertes Token wäre sonst noch 30
 * Tage gültig.
 *
 * Hochgezählt wird Aelis eigener Zähler (`AeliAuthState`), nicht
 * `User.sessionVersion` — der gehört Aera, und ein Abmelden auf aeli.so soll
 * niemanden aus seiner Community werfen.
 */
export async function endCurrentSessions(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await endSessions(session.userId, session.aeliSessionVersion).catch((error) => {
    console.error("[aeli] Abmelden: Sitzungszaehler nicht erhoeht:", error);
  });
}

/** Passt das Token noch zum Konto? Beide Zähler müssen stimmen. */
export function sessionIsCurrent(
  session: SessionPayload,
  user: { sessionVersion: number; aeliSessionVersion: number; accountStatus: string },
): boolean {
  return (
    user.accountStatus === "ACTIVE" &&
    // Ein hochgezaehltes `sessionVersion` entwertet alle alten Tokens — z. B.
    // nach einem Passwortwechsel drueben in Aera.
    user.sessionVersion === session.sessionVersion &&
    // Und Aelis eigener Zaehler: nach einem Abmelden auf aeli.so.
    user.aeliSessionVersion === session.aeliSessionVersion
  );
}

/**
 * Der angemeldete Nutzer, einmal pro Anfrage geladen (Layout und Seite teilen
 * sich den Treffer).
 *
 * Setzt bewusst KEINEN Datenbank-Kontext: der wird dort aufgespannt, wo auch
 * die Abfrage steht (lib/prisma.ts erklaert, warum das die einzige Variante
 * ist, die haelt).
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await sessionUser(session.userId);
  if (!user || !sessionIsCurrent(session, user)) return null;
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl };
});
