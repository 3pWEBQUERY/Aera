import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  secretNeedsRotation,
} from "@/lib/secret-encryption";

const key = (byte: number) => Buffer.alloc(32, byte).toString("base64");

describe("database secret encryption", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("roundtrips AES-256-GCM ciphertext without exposing plaintext", () => {
    vi.stubEnv("AERA_DATA_ENCRYPTION_KEYS", `current:${key(1)}`);
    const stored = encryptSecret("whsec_highly-sensitive");

    expect(isEncryptedSecret(stored)).toBe(true);
    expect(stored).not.toContain("highly-sensitive");
    expect(decryptSecret(stored)).toBe("whsec_highly-sensitive");
    expect(secretNeedsRotation(stored)).toBe(false);
  });

  it("keeps old keys readable and marks them for rotation", () => {
    vi.stubEnv("AERA_DATA_ENCRYPTION_KEYS", `old:${key(2)}`);
    const oldCiphertext = encryptSecret("totp-secret");
    vi.stubEnv(
      "AERA_DATA_ENCRYPTION_KEYS",
      `current:${key(3)},old:${key(2)}`,
    );

    expect(decryptSecret(oldCiphertext)).toBe("totp-secret");
    expect(secretNeedsRotation(oldCiphertext)).toBe(true);
  });

  it("rejects authenticated ciphertext tampering", () => {
    vi.stubEnv("AERA_DATA_ENCRYPTION_KEYS", `current:${key(4)}`);
    const stored = encryptSecret("secret");
    const tampered = `${stored.slice(0, -1)}${stored.endsWith("A") ? "B" : "A"}`;
    expect(() => decryptSecret(tampered)).toThrow(
      "Encrypted secret authentication failed",
    );
  });

  it("fails closed for new production writes without a keyring", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AERA_DATA_ENCRYPTION_KEYS", "");
    expect(() => encryptSecret("secret")).toThrow(
      "AERA_DATA_ENCRYPTION_KEYS is required",
    );
  });

  it("rejects malformed and duplicate keyring entries", () => {
    vi.stubEnv("AERA_DATA_ENCRYPTION_KEYS", "current:not-valid-base64");
    expect(() => encryptSecret("secret")).toThrow("exactly 32 bytes");

    const unpadded = key(5).replace(/=+$/, "");
    vi.stubEnv("AERA_DATA_ENCRYPTION_KEYS", `current:${unpadded}`);
    expect(() => encryptSecret("secret")).toThrow("canonical base64");

    vi.stubEnv(
      "AERA_DATA_ENCRYPTION_KEYS",
      `current:${key(5)},current:${key(6)}`,
    );
    expect(() => encryptSecret("secret")).toThrow("Duplicate encryption key id");
  });
});
