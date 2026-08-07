import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * TOTP-Pruefung (RFC 6238) — die Verifikationshaelfte von Aeras `lib/totp.ts`.
 * SHA-1, 6 Stellen, 30-Sekunden-Slots.
 *
 * Aeli richtet Zwei-Faktor nicht ein und zeigt keine QR-Codes dafuer; das
 * bleibt in Aeras Kontoeinstellungen. Hier wird nur geprueft, damit ein Konto
 * mit aktivem 2FA sich auf aeli.so genauso anmelden kann wie drueben.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD_S = 30;
const DIGITS = 6;

function base32Decode(input: string): Buffer {
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

function totpCode(secretBase32: string, timestampMs: number): string {
  const counter = Math.floor(timestampMs / 1000 / PERIOD_S);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Akzeptiert +/- einen Zeit-Slot gegen Uhrendrift. Der Vergleich laeuft in
 * konstanter Zeit, damit die Laufzeit den richtigen Code nicht verraet.
 */
export function verifyTotp(secretBase32: string, code: string, timestampMs = Date.now()): boolean {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const given = Buffer.from(normalized);
  for (const drift of [0, -1, 1]) {
    const expected = Buffer.from(totpCode(secretBase32, timestampMs + drift * PERIOD_S * 1000));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
  }
  return false;
}
