import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

type LookupResult = { address: string; family: number };
type LookupFn = (hostname: string) => Promise<LookupResult[]>;

function ipv4Number(address: string): number | null {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0]! * 256 + parts[1]!) * 256 + parts[2]!) * 256 + parts[3]!) >>> 0;
}

function inV4Range(value: number, base: string, prefix: number): boolean {
  const baseValue = ipv4Number(base)!;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

function ipv6Number(input: string): bigint | null {
  let address = input.toLowerCase().split("%")[0]!;
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const v4 = ipv4Number(address.slice(lastColon + 1));
    if (v4 === null) return null;
    address = `${address.slice(0, lastColon)}:${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  const parts = [...left, ...Array(Math.max(fill, 0)).fill("0"), ...right];
  if (parts.length !== 8) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    value = (value << 16n) | BigInt(`0x${part}`);
  }
  return value;
}

/** Reject non-public, loopback, private, link-local and documentation ranges. */
export function isBlockedWebhookAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address)!;
    return [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
      ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
      ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, prefix]) => inV4Range(value, base as string, prefix as number));
  }
  if (family !== 6) return true;
  const value = ipv6Number(address);
  if (value === null) return true;
  if (value === 0n || value === 1n) return true;
  if ((value >> 121n) === 0x7en) return true; // fc00::/7
  if ((value >> 118n) === 0x3fan) return true; // fe80::/10
  if ((value >> 120n) === 0xffn) return true; // multicast
  if ((value >> 96n) === 0x20010db8n) return true; // documentation
  if ((value >> 32n) === 0xffffn) {
    return isBlockedWebhookAddress([
      Number((value >> 24n) & 255n), Number((value >> 16n) & 255n),
      Number((value >> 8n) & 255n), Number(value & 255n),
    ].join("."));
  }
  return false;
}

async function defaultLookup(hostname: string): Promise<LookupResult[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

export async function validateWebhookUrl(
  rawUrl: string,
  options: { allowHttp?: boolean; lookup?: LookupFn } = {},
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (url.protocol !== "https:" && !(options.allowHttp && url.protocol === "http:")) {
    return { ok: false, error: "HTTPS is required" };
  }
  if (url.username || url.password) return { ok: false, error: "URL credentials are not allowed" };
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
    hostname.endsWith(".internal") || hostname.endsWith(".home.arpa")
  ) {
    return { ok: false, error: "Private hostnames are not allowed" };
  }
  try {
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await (options.lookup ?? defaultLookup)(hostname);
    if (addresses.length === 0 || addresses.some((entry) => isBlockedWebhookAddress(entry.address))) {
      return { ok: false, error: "Private or non-routable addresses are not allowed" };
    }
  } catch {
    return { ok: false, error: "Hostname could not be resolved" };
  }
  return { ok: true, url: url.toString() };
}
