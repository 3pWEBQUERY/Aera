import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Versioned AES-256-GCM envelope for secrets persisted in PostgreSQL.
 *
 * `AERA_DATA_ENCRYPTION_KEYS` is a comma-separated keyring. The first entry is
 * used for new values; the remaining entries keep older ciphertext readable
 * during a rotation:
 *
 *   primary:BASE64_32_BYTE_KEY,previous:BASE64_32_BYTE_KEY
 *
 * Legacy plaintext remains readable so an existing installation can run the
 * rotation script without downtime. New production writes fail closed when no
 * valid keyring is configured.
 */

const PREFIX = "aera-secret:v1";

interface EncryptionKey {
  id: string;
  bytes: Buffer;
}

function parseKeyring(raw = process.env.AERA_DATA_ENCRYPTION_KEYS ?? ""): EncryptionKey[] {
  if (!raw.trim()) return [];
  const ids = new Set<string>();
  return raw.split(",").map((entry) => {
    const separator = entry.indexOf(":");
    if (separator <= 0) {
      throw new Error("AERA_DATA_ENCRYPTION_KEYS entries must use key-id:base64-key");
    }
    const id = entry.slice(0, separator).trim();
    const encoded = entry.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
      throw new Error(`Invalid encryption key id: ${id || "<empty>"}`);
    }
    if (ids.has(id)) throw new Error(`Duplicate encryption key id: ${id}`);
    ids.add(id);
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length !== 32) {
      throw new Error(
        `Encryption key ${id} must decode to exactly 32 bytes ` +
          "(generate one with: openssl rand -base64 32)",
      );
    }
    // Buffer.from is intentionally lenient and otherwise accepts malformed or
    // unpadded input. Require the unique standard Base64 representation so a
    // key accepted by environment validation behaves identically at runtime.
    if (bytes.toString("base64") !== encoded) {
      throw new Error(`Encryption key ${id} must be canonical base64`);
    }
    return { id, bytes };
  });
}

function keyring(): EncryptionKey[] {
  return parseKeyring();
}

export function encryptionConfigured(): boolean {
  return keyring().length > 0;
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

export function encryptSecret(plaintext: string): string {
  const [primary] = keyring();
  if (!primary) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AERA_DATA_ENCRYPTION_KEYS is required before sensitive data can be stored in production",
      );
    }
    // Local/test databases may stay readable without forcing every developer
    // to manage a keyring. Production never takes this branch.
    return plaintext;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", primary.bytes, iv);
  cipher.setAAD(Buffer.from(`${PREFIX}:${primary.id}`, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    primary.id,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  if (!isEncryptedSecret(stored)) return stored;

  const parts = stored.split(":");
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}` !== PREFIX) {
    throw new Error("Malformed encrypted secret");
  }
  const [, , keyId, ivEncoded, tagEncoded, ciphertextEncoded] = parts;
  const key = keyring().find((candidate) => candidate.id === keyId);
  if (!key) {
    throw new Error(`Encryption key ${keyId} is not available in the configured keyring`);
  }

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
    throw new Error("Encrypted secret authentication failed");
  }
}

/** True for plaintext or ciphertext written with a non-primary rotation key. */
export function secretNeedsRotation(stored: string): boolean {
  const [primary] = keyring();
  if (!primary) return false;
  if (!isEncryptedSecret(stored)) return true;
  return stored.split(":")[2] !== primary.id;
}

export const __test = { parseKeyring };
