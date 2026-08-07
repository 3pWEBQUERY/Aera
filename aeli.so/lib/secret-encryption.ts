import { createDecipheriv } from "node:crypto";

/**
 * Nur die Lese-Haelfte von Aeras `lib/secret-encryption.ts`.
 *
 * Aeli entschluesselt genau einen Wert: das TOTP-Geheimnis eines Kontos, das
 * sich hier anmeldet und Zwei-Faktor aktiv hat. Es verschluesselt nie, rotiert
 * nie und legt nie neue Geheimnisse an — deshalb fehlen `encryptSecret` und
 * `secretNeedsRotation` hier bewusst. Wer das Schluesselformat aendert, aendert
 * es in Aera; das Praefix ist versioniert (`v1`), ein Bruch faellt also sofort
 * auf, statt still falsch zu entschluesseln.
 *
 * `AERA_DATA_ENCRYPTION_KEYS` traegt denselben Schluesselbund wie bei Aera:
 *   primary:BASE64_32_BYTE_KEY,previous:BASE64_32_BYTE_KEY
 * Fehlt er, koennen 2FA-Konten sich hier nicht anmelden — siehe lib/auth.ts.
 */

const PREFIX = "aera-secret:v1";

interface EncryptionKey {
  id: string;
  bytes: Buffer;
}

function keyring(raw = process.env.AERA_DATA_ENCRYPTION_KEYS ?? ""): EncryptionKey[] {
  if (!raw.trim()) return [];
  return raw.split(",").flatMap((entry) => {
    const separator = entry.indexOf(":");
    if (separator <= 0) return [];
    const id = entry.slice(0, separator).trim();
    const bytes = Buffer.from(entry.slice(separator + 1).trim(), "base64");
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || bytes.length !== 32) return [];
    return [{ id, bytes }];
  });
}

export function encryptionConfigured(): boolean {
  return keyring().length > 0;
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

export function decryptSecret(stored: string): string {
  // Altbestand aus der Zeit vor dem Schluesselbund liegt als Klartext in der
  // Spalte. Aera liest ihn genauso, sonst waeren diese Konten ausgesperrt.
  if (!isEncryptedSecret(stored)) return stored;

  const parts = stored.split(":");
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}` !== PREFIX) {
    throw new Error("Verschluesseltes Geheimnis hat ein unbekanntes Format");
  }
  const [, , keyId, ivEncoded, tagEncoded, ciphertextEncoded] = parts;
  const key = keyring().find((candidate) => candidate.id === keyId);
  if (!key) throw new Error(`Schluessel ${keyId} ist nicht konfiguriert`);

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key.bytes,
      Buffer.from(ivEncoded!, "base64url"),
    );
    decipher.setAAD(Buffer.from(`${PREFIX}:${keyId}`, "utf8"));
    decipher.setAuthTag(Buffer.from(tagEncoded!, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded!, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Verschluesseltes Geheimnis konnte nicht geprueft werden");
  }
}
