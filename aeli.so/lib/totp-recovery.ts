import { createHash } from "node:crypto";

/**
 * Wiederherstellungscodes für die Zwei-Faktor-Anmeldung — die Prüfseite.
 *
 * Eingerichtet und neu erzeugt werden die Codes in Aera (lib/totp-recovery.ts);
 * Aeli verbraucht sie nur. Dafür muss der Hash bitgenau derselbe sein: SHA-256
 * über ein festes Präfix, die userId und den normalisierten Code. Der
 * Vergleich und das Verbrauchen passieren in der Datenbank
 * (`aeli_consume_totp_recovery_code`), damit ein Code auch bei zwei
 * gleichzeitigen Anmeldungen genau einmal gilt.
 *
 * Bewusst ohne `server-only`: reine Rechnung, damit der Test sie direkt
 * gegen Aeras Fassung halten kann.
 */

const CODE_LENGTH = 12;

/** Kleinbuchstaben, ohne Leer- und Trennzeichen. */
export function normalizeRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Sieht die Eingabe wie ein Wiederherstellungscode aus (statt wie ein TOTP)? */
export function looksLikeRecoveryCode(input: string): boolean {
  return normalizeRecoveryCode(input).length === CODE_LENGTH;
}

export function hashRecoveryCode(userId: string, code: string): string {
  return createHash("sha256")
    .update("aera-totp-recovery:v1\0")
    .update(userId)
    .update("\0")
    .update(normalizeRecoveryCode(code))
    .digest("hex");
}
