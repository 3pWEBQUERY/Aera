import "server-only";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { systemPrisma as prisma } from "./prisma";

/**
 * Einmal-Wiederherstellungscodes für die Zwei-Faktor-Anmeldung.
 *
 * Wer das Handy mit der Authenticator-App verliert, meldet sich mit einem
 * dieser Codes an. Jeder Code gilt genau einmal. Gespeichert wird nur ein
 * SHA-256-Hash (gesalzen mit der userId, damit gleiche Codes bei zwei Konten
 * verschiedene Hashes ergeben); der Klartext wird genau einmal angezeigt.
 *
 * Format: 12 Zeichen aus 31 gut unterscheidbaren Symbolen, angezeigt als
 * „abcd-efgh-jkmn“.
 */

export const RECOVERY_CODE_COUNT = 10;
const CODE_LENGTH = 12;
// Ohne verwechselbare Zeichen (0/o, 1/l/i): 31 Symbole, randomInt ist
// gleichverteilt, also rund 59 Bit Zufall je Code.
const SYMBOLS = "abcdefghjkmnpqrstuvwxyz23456789";

/** Neuer Klartext-Code, z. B. „k3mf-9qpz-x2ab“. */
export function generateRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) raw += SYMBOLS[randomInt(SYMBOLS.length)];
  return formatRecoveryCode(raw);
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateRecoveryCode());
  return [...codes];
}

/** Kleinbuchstaben, ohne Leer- und Trennzeichen. */
export function normalizeRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatRecoveryCode(raw: string): string {
  return raw.match(/.{1,4}/g)!.join("-");
}

/** Sieht die Eingabe überhaupt wie ein Wiederherstellungscode aus? */
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

/**
 * Sucht den passenden Hash in konstanter Zeit über alle Kandidaten (kein
 * vorzeitiger Abbruch) und gibt dessen Index zurück, sonst -1.
 */
export function matchRecoveryHash(candidateHashes: string[], givenHash: string): number {
  const given = Buffer.from(givenHash, "hex");
  let found = -1;
  for (let i = 0; i < candidateHashes.length; i++) {
    const candidate = Buffer.from(candidateHashes[i]!, "hex");
    const equal = candidate.length === given.length && timingSafeEqual(candidate, given);
    if (equal && found === -1) found = i;
  }
  return found;
}

/**
 * Ersetzt alle Codes eines Kontos durch neue (alte werden ungültig) und gibt
 * die Klartexte zurück — einmalig, zum Anzeigen.
 */
export async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.totpRecoveryCode.deleteMany({ where: { userId } }),
    prisma.totpRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(userId, code) })),
    }),
  ]);
  return codes;
}

export async function deleteRecoveryCodes(userId: string): Promise<void> {
  await prisma.totpRecoveryCode.deleteMany({ where: { userId } });
}

export async function countRecoveryCodes(userId: string): Promise<number> {
  return prisma.totpRecoveryCode.count({ where: { userId, usedAt: null } });
}

/**
 * Prüft einen Code und verbraucht ihn. Das Verbrauchen ist ein bedingtes
 * Update (`usedAt IS NULL`): zwei gleichzeitige Anmeldungen mit demselben
 * Code können ihn nicht beide einlösen.
 */
export async function consumeRecoveryCode(userId: string, input: string): Promise<boolean> {
  if (!looksLikeRecoveryCode(input)) return false;
  const rows = await prisma.totpRecoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  const index = matchRecoveryHash(
    rows.map((r) => r.codeHash),
    hashRecoveryCode(userId, input),
  );
  if (index === -1) return false;
  const { count } = await prisma.totpRecoveryCode.updateMany({
    where: { id: rows[index]!.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}
