import "server-only";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { systemPrisma } from "./prisma";
import { getSession, setSessionCookie } from "./session";
import type { User } from "@/app/generated/prisma/client";

/**
 * Aeli und Aera teilen sich die `User`-Tabelle: ein Konto, zwei Produkte.
 * Wer auf aera.so registriert ist, meldet sich hier mit denselben Zugangsdaten
 * an — ohne zweites Passwort und ohne Kontoabgleich.
 *
 * Dieser Pfad ist der einzige in der App, der ueber die privilegierte
 * Verbindung laeuft. `aeli_app` hat auf `User` bewusst keinerlei Rechte (siehe
 * Migration 20260807120000_aeli_link_in_bio), also kann Anmeldung nirgendwo
 * sonst stattfinden — und alles andere kann es auch nicht versehentlich.
 */

/** Kostenfaktor 12, identisch zu Aera — sonst waeren die Hashes inkompatibel. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const LEGAL_DOCUMENT = { terms: "TERMS", privacyNotice: "PRIVACY_NOTICE" } as const;
// Muss zu Aeras lib/legal.ts passen: beide Produkte laufen unter denselben
// Bedingungen, also darf hier keine eigene Versionszaehlung entstehen.
const CURRENT_TERMS_VERSION = "2026-07-19";
const CURRENT_PRIVACY_VERSION = "2026-07-19";

export type RegisterResult =
  | { ok: true; user: User; hadAccount: false }
  | { ok: false; error: "emailAlreadyRegistered" | "invalidInput" };

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name || input.password.length < 10) return { ok: false, error: "invalidInput" };

  try {
    const user = await systemPrisma.user.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(input.password),
        // Zustimmung wird beim Anlegen belegt, nicht spaeter behauptet. Die
        // Quelle unterscheidet Aeli von Aeras eigenen Anmeldungen, damit im
        // Zweifel nachvollziehbar bleibt, wo jemand zugestimmt hat.
        legalAcceptances: {
          create: [
            { document: LEGAL_DOCUMENT.terms, version: CURRENT_TERMS_VERSION, source: "AELI_SIGNUP" },
            {
              document: LEGAL_DOCUMENT.privacyNotice,
              version: CURRENT_PRIVACY_VERSION,
              source: "AELI_SIGNUP",
            },
          ],
        },
      },
    });
    await startSession(user);
    return { ok: true, user, hadAccount: false };
  } catch (e) {
    // Der Unique-Index entscheidet, nicht ein vorheriges SELECT — sonst
    // gewinnt bei zwei gleichzeitigen Anmeldungen der Zufall.
    if ((e as { code?: string }).code === "P2002") {
      return { ok: false, error: "emailAlreadyRegistered" };
    }
    throw e;
  }
}

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; error?: "invalidCredentials" | "totpCodeInvalid" | "totpUnavailable"; needsTotp?: boolean };

export async function authenticate(email: string, password: string, totp?: string): Promise<AuthResult> {
  const user = await systemPrisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  // Bewusst dieselbe Antwort fuer „kein Konto“ und „falsches Passwort“: sonst
  // wird die Anmeldemaske zum Verzeichnis, in dem man E-Mail-Adressen abfragt.
  if (!user || user.accountStatus !== "ACTIVE") return { ok: false, error: "invalidCredentials" };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "invalidCredentials" };
  }

  // Zwei-Faktor erst nach korrektem Passwort abfragen, sonst verraet allein die
  // Code-Abfrage, dass es dieses Konto gibt.
  if (user.totpEnabledAt && user.totpSecret) {
    if (!totp) return { ok: false, needsTotp: true };
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
      // glauben, sein Authenticator sei kaputt.
      console.error(`[aeli] TOTP-Geheimnis nicht lesbar (User ${user.id}):`, error);
      return { ok: false, error: "totpUnavailable" };
    }
    if (!verifyTotp(secret, totp)) return { ok: false, needsTotp: true, error: "totpCodeInvalid" };
  }

  await startSession(user);
  return { ok: true, user };
}

async function startSession(user: Pick<User, "id" | "sessionVersion">): Promise<void> {
  await setSessionCookie({ userId: user.id, sessionVersion: user.sessionVersion });
}

/**
 * Der angemeldete Nutzer, einmal pro Anfrage geladen (Layout und Seite teilen
 * sich den Treffer).
 *
 * Setzt bewusst KEINEN Datenbank-Kontext: der wird dort aufgespannt, wo auch
 * die Abfrage steht (lib/prisma.ts erklaert, warum das die einzige Variante
 * ist, die haelt).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await systemPrisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.accountStatus !== "ACTIVE") return null;
  // Ein hochgezaehltes `sessionVersion` entwertet alle alten Tokens — z. B.
  // nach einem Passwortwechsel drueben in Aera.
  if (user.sessionVersion !== session.sessionVersion) return null;
  return user;
});
