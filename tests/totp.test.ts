import { describe, it, expect } from "vitest";
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  totpCode,
  verifyTotp,
  otpauthUrl,
} from "@/lib/totp";

// RFC-6238-Testvektor: ASCII "12345678901234567890" als Secret.
const RFC_SECRET_B32 = base32Encode(Buffer.from("12345678901234567890"));

describe("base32", () => {
  it("roundtrips arbitrary bytes", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 42]);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it("decodes case-insensitively and ignores separators", () => {
    const buf = Buffer.from("hello world");
    const encoded = base32Encode(buf);
    expect(base32Decode(encoded.toLowerCase()).equals(buf)).toBe(true);
    expect(base32Decode(encoded.match(/.{1,4}/g)!.join(" ")).equals(buf)).toBe(true);
  });
});

describe("totpCode (RFC 6238 vectors, SHA-1, 6 digits)", () => {
  it("T=59s -> 287082", () => {
    expect(totpCode(RFC_SECRET_B32, 59_000)).toBe("287082");
  });

  it("T=1111111109s -> 081804", () => {
    expect(totpCode(RFC_SECRET_B32, 1_111_111_109_000)).toBe("081804");
  });

  it("T=1234567890s -> 005924", () => {
    expect(totpCode(RFC_SECRET_B32, 1_234_567_890_000)).toBe("005924");
  });
});

describe("verifyTotp", () => {
  it("accepts the current code and ±1 slot drift", () => {
    const t = 1_234_567_890_000;
    const code = totpCode(RFC_SECRET_B32, t);
    expect(verifyTotp(RFC_SECRET_B32, code, t)).toBe(true);
    // Gleicher Code, 30s später (Uhrendrift) — noch im Fenster.
    expect(verifyTotp(RFC_SECRET_B32, code, t + 30_000)).toBe(true);
    // 2 Slots später -> abgelaufen.
    expect(verifyTotp(RFC_SECRET_B32, code, t + 90_000)).toBe(false);
  });

  it("accepts codes with whitespace, rejects malformed input", () => {
    const t = 1_234_567_890_000;
    const code = totpCode(RFC_SECRET_B32, t);
    expect(verifyTotp(RFC_SECRET_B32, `${code.slice(0, 3)} ${code.slice(3)}`, t)).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, "12345", t)).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, "abcdef", t)).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, "", t)).toBe(false);
  });

  it("rejects codes from a different secret", () => {
    const t = Date.now();
    const other = generateTotpSecret();
    const code = totpCode(RFC_SECRET_B32, t);
    expect(verifyTotp(other, code, t)).toBe(false);
  });
});

describe("generateTotpSecret / otpauthUrl", () => {
  it("generates 160-bit base32 secrets", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it("builds a valid otpauth URL", () => {
    const url = otpauthUrl("ABCDEF234567", "anna@example.com");
    expect(url.startsWith("otpauth://totp/Aera%3Aanna%40example.com?")).toBe(true);
    expect(url).toContain("secret=ABCDEF234567");
    expect(url).toContain("issuer=Aera");
    expect(url).toContain("digits=6");
  });
});
