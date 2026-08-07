import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { detectImageType, imageKey, isImagePurpose, processImage } from "@/lib/images";

/**
 * Der Upload-Pfad ist die einzige Stelle, an der fremde Bytes in den Bucket
 * gelangen. Dieser Test hält beides fest: dass echte Bilder durchkommen — und
 * dass alles andere vorher endet.
 */

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } } })
    .png()
    .toBuffer();

describe("detectImageType", () => {
  it("erkennt die Formate an den echten ersten Bytes", async () => {
    const source = await png(64, 64);
    expect(detectImageType(source)).toBe("image/png");
    expect(detectImageType(await sharp(source).jpeg().toBuffer())).toBe("image/jpeg");
    expect(detectImageType(await sharp(source).webp().toBuffer())).toBe("image/webp");
    expect(detectImageType(await sharp(source).gif().toBuffer())).toBe("image/gif");
  });

  it("lässt sich nicht von einer behaupteten Endung täuschen", () => {
    // Genau der Fall, gegen den geprüft wird: ein Skript, das „bild.png" heißt.
    const script = Buffer.from("<?php system($_GET['c']); ?>".padEnd(64, " "));
    expect(detectImageType(script)).toBeNull();
  });

  it("nimmt kein SVG an", () => {
    // SVG ist ein Dokument mit Skriptfähigkeit, kein Bild im Sinne dieser App.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'.padEnd(64, " "));
    expect(detectImageType(svg)).toBeNull();
  });

  it("weist zu kurze Eingaben ab, statt daran zu scheitern", () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("processImage", () => {
  it("bringt ein großes Foto auf Avatargröße und nach WebP", async () => {
    const result = await processImage(await png(2400, 1800), "avatar");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const meta = await sharp(result.body).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512); // zugeschnitten, nicht verzerrt
    expect(result.contentType).toBe("image/webp");
  });

  it("bläst kleine Bilder nicht künstlich auf", async () => {
    const result = await processImage(await png(120, 120), "avatar");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await sharp(result.body).metadata()).width).toBe(120);
  });

  it("entfernt die Metadaten — inklusive GPS-Position", async () => {
    // Ein Handyfoto trägt regelmäßig die Koordinaten der Aufnahme. Wer sein
    // Profilbild zu Hause macht, würde damit seine Adresse veröffentlichen.
    const withExif = await sharp(await png(800, 800))
      .withExif({ IFD0: { Copyright: "Marie Lang", Software: "Kamera" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const result = await processImage(withExif, "avatar");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await sharp(result.body).metadata()).exif).toBeUndefined();
  });

  it("gibt für denselben Bildinhalt denselben Hash", async () => {
    const source = await png(600, 600);
    const a = await processImage(source, "avatar");
    const b = await processImage(source, "avatar");
    expect(a.ok && b.ok && a.hash === b.hash).toBe(true);
  });

  it("weist ab, was kein Bild ist", async () => {
    const result = await processImage(Buffer.from("nur text, aber lang genug dafür"), "avatar");
    expect(result).toEqual({ ok: false, error: "notAnImage" });
  });

  it("weist zu große Dateien ab, ohne sie zu dekodieren", async () => {
    const huge = Buffer.alloc(13 * 1024 * 1024);
    // Gültige JPEG-Signatur, damit wirklich die Größe der Grund ist.
    huge.set([0xff, 0xd8, 0xff, 0xe0], 0);
    expect(await processImage(huge, "banner")).toEqual({ ok: false, error: "tooLarge" });
  });
});

describe("imageKey", () => {
  it("trägt Nutzer, Zweck und Hash im Pfad", () => {
    expect(imageKey("user_1", "avatar", "abc", "webp")).toBe("aeli/user_1/avatar-abc.webp");
  });
});

describe("isImagePurpose", () => {
  it("kennt genau die zwei Zwecke", () => {
    expect(isImagePurpose("avatar")).toBe(true);
    expect(isImagePurpose("banner")).toBe(true);
    expect(isImagePurpose("beliebig")).toBe(false);
  });
});
