import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `keyFromMediaUrl` entscheidet, ob beim Austauschen eines Bildes ein Objekt
 * gelöscht wird. Ein falsches Ja hieße: eine fremde Adresse wird als unsere
 * gelesen und ein Löschversuch auf einen erratenen Schlüssel abgesetzt.
 * Deshalb steht hier vor allem, was NICHT als unser Objekt gilt.
 */

async function load(publicUrl = "") {
  vi.resetModules();
  vi.stubEnv("S3_PUBLIC_URL", publicUrl);
  return import("@/lib/storage");
}

afterEach(() => vi.unstubAllEnvs());

describe("mediaUrl / keyFromMediaUrl — privater Bucket (Standard)", () => {
  it("liefert den eigenen Proxy-Pfad und findet daraus den Schlüssel zurück", async () => {
    const { mediaUrl, keyFromMediaUrl } = await load();
    const key = "aeli/user_1/avatar-abc.webp";
    const url = mediaUrl(key);
    expect(url).toBe("/api/media/aeli/user_1/avatar-abc.webp");
    expect(keyFromMediaUrl(url)).toBe(key);
  });

  it("hält fremde Adressen für fremd", async () => {
    const { keyFromMediaUrl } = await load();
    for (const url of [
      "https://images.example.com/foto.jpg",
      "https://example.com/api/media/aeli/user_1/avatar.webp",
      "",
      null,
      undefined,
    ]) {
      expect(keyFromMediaUrl(url), String(url)).toBeNull();
    }
  });
});

describe("mediaUrl / keyFromMediaUrl — öffentlicher Bucket oder CDN", () => {
  it("zeigt direkt dorthin und erkennt den Rückweg", async () => {
    const { mediaUrl, keyFromMediaUrl } = await load("https://cdn.aeli.so");
    const key = "aeli/user_1/banner-xyz.webp";
    expect(mediaUrl(key)).toBe("https://cdn.aeli.so/aeli/user_1/banner-xyz.webp");
    expect(keyFromMediaUrl("https://cdn.aeli.so/aeli/user_1/banner-xyz.webp")).toBe(key);
  });

  it("beansprucht ein anderes CDN nicht für sich", async () => {
    const { keyFromMediaUrl } = await load("https://cdn.aeli.so");
    expect(keyFromMediaUrl("https://cdn.example.com/aeli/user_1/banner.webp")).toBeNull();
  });
});
