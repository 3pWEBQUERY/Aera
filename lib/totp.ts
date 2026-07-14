import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * TOTP (RFC 6238) ohne Fremd-Dependency: SHA-1, 6 Stellen, 30-Sekunden-Slots —
 * kompatibel mit Google Authenticator, 1Password, Authy & Co.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD_S = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 20 zufällige Bytes (160 Bit) — RFC-4226-Empfehlung für SHA-1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Berechnet den 6-stelligen Code für einen Zeit-Slot. */
export function totpCode(secretBase32: string, timestampMs = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / PERIOD_S);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", base32Decode(secretBase32))
    .update(counterBuf)
    .digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Prüft einen Code; akzeptiert ±1 Zeit-Slot (30s) gegen Uhren-Drift.
 * Konstantzeit-Vergleich gegen Timing-Angriffe.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  timestampMs = Date.now(),
): boolean {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const given = Buffer.from(normalized);
  for (const drift of [0, -1, 1]) {
    const expected = Buffer.from(
      totpCode(secretBase32, timestampMs + drift * PERIOD_S * 1000),
    );
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return true;
    }
  }
  return false;
}

/** otpauth://-URL für Authenticator-Apps (QR-Code-Inhalt). */
export function otpauthUrl(secretBase32: string, accountEmail: string): string {
  const issuer = "Aera";
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_S),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
