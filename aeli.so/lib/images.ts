import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

/**
 * Was zwischen „Datei ausgewählt" und „liegt im Bucket" passiert.
 *
 * Das Bild wird nicht durchgereicht, sondern neu erzeugt: zugeschnitten,
 * herunterskaliert, nach WebP kodiert. Drei Gründe, in dieser Reihenfolge:
 *
 *  1. **Tempo.** Aeli verkauft „lädt auf jedem Handy sofort". Ein Profilbild
 *     kommt heute mit 4 000 × 3 000 Pixeln aus der Kamera; ungerechnet wären
 *     das mehrere Megabyte auf jedem einzelnen Seitenaufruf — und die Seite
 *     wird meistens im Mobilfunknetz geöffnet.
 *
 *  2. **Datenschutz.** Handyfotos tragen EXIF-Daten, darunter regelmäßig die
 *     GPS-Koordinaten der Aufnahme. Wer sein Profilbild zu Hause macht, würde
 *     mit dem Bild seine Adresse veröffentlichen. Sharp schreibt die Metadaten
 *     nicht mit — das Ergebnis trägt nur noch Pixel.
 *
 *  3. **Sicherheit.** Ein neu kodiertes Bild ist genau das: Pixel in einem
 *     Container, den wir selbst geschrieben haben. Was vorher zwischen den
 *     Pixeln stand — angehängte Archive, Skripte in einem SVG, ein Payload für
 *     einen Decoder-Fehler — überlebt die Umwandlung nicht.
 */

const MB = 1024 * 1024;

export interface ImageVariant {
  /** Kantenlängen der Zielfläche. Zugeschnitten, nicht verzerrt. */
  width: number;
  height: number;
  /** Obergrenze für die hochgeladene Datei. */
  maxBytes: number;
  quality: number;
}

/**
 * Zwei Formate, weil es zwei Aufgaben sind: ein Avatar wird als Kreis in
 * 96 Pixeln angezeigt (512 gibt Reserve für Retina und spätere größere
 * Darstellungen), ein Titelbild läuft über die volle Breite der Seite.
 */
export const IMAGE_VARIANTS = {
  avatar: { width: 512, height: 512, maxBytes: 8 * MB, quality: 82 },
  banner: { width: 1600, height: 600, maxBytes: 12 * MB, quality: 80 },
  /**
   * Der Seitenhintergrund. Hochkant, weil eine Bio-Seite hochkant gelesen
   * wird, und mit spürbar niedrigerer Qualität: das Bild liegt hinter Text,
   * meist weichgezeichnet und abgedunkelt — dort sieht niemand den Unterschied
   * zwischen 68 und 85, wohl aber die halbe Ladezeit.
   */
  background: { width: 1200, height: 2000, maxBytes: 16 * MB, quality: 68 },
  /**
   * Das Bild unter dem geteilten Link (og:image). 1200 × 630 ist das Format,
   * das WhatsApp, Slack, X und LinkedIn erwarten — wer ein anderes hochlädt,
   * bekommt es zugeschnitten statt in einem grauen Rahmen zentriert.
   */
  social: { width: 1200, height: 630, maxBytes: 12 * MB, quality: 82 },
  /**
   * Das kleine Bild links in einem Baustein. Es wird mit 40 CSS-Pixeln
   * dargestellt — 320 reichen damit bis zu vierfacher Pixeldichte, und mehr
   * waere Bytes fuer nichts. Quadratisch, weil der Platz im Knopf quadratisch
   * ist: ein Querformat wuerde ohnehin beschnitten, nur eben im Browser.
   */
  thumbnail: { width: 320, height: 320, maxBytes: 8 * MB, quality: 82 },
} as const satisfies Record<string, ImageVariant>;

export type ImagePurpose = keyof typeof IMAGE_VARIANTS;

export function isImagePurpose(value: string): value is ImagePurpose {
  return Object.prototype.hasOwnProperty.call(IMAGE_VARIANTS, value);
}

/**
 * Erlaubte Eingangsformate — geprüft an den echten ersten Bytes, nicht am
 * `Content-Type`, den der Browser mitschickt. Der ist eine Behauptung des
 * Clients; die Bytes sind es nicht.
 *
 * SVG fehlt bewusst und dauerhaft: es ist ein Dokument mit Skriptfähigkeit und
 * externen Referenzen, kein Bild im Sinne dieser Funktion.
 */
const SIGNATURES: { type: string; test: (bytes: Buffer) => boolean }[] = [
  { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/png",
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    type: "image/webp",
    test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
  { type: "image/gif", test: (b) => b.subarray(0, 6).toString("latin1").startsWith("GIF8") },
  {
    // AVIF und HEIC teilen sich die ISOBMFF-Hülle; moderne iPhones liefern
    // HEIC, wenn man ein Foto direkt aus der Mediathek auswählt.
    type: "image/avif",
    test: (b) =>
      b.subarray(4, 8).toString("latin1") === "ftyp" &&
      ["avif", "avis", "heic", "heix", "mif1"].includes(b.subarray(8, 12).toString("latin1")),
  },
];

export function detectImageType(bytes: Buffer): string | null {
  if (bytes.length < 16) return null;
  return SIGNATURES.find((entry) => entry.test(bytes))?.type ?? null;
}

export type ProcessResult =
  | { ok: true; body: Buffer; contentType: "image/webp"; extension: "webp"; hash: string; bytes: number }
  | { ok: false; error: "tooLarge" | "notAnImage" | "broken" };

/**
 * Nimmt die hochgeladenen Bytes und gibt das fertige Objekt zurück.
 *
 * Der Hash steht über dem fertigen Bild, nicht über der Eingabe: zweimal
 * dasselbe Foto — einmal als HEIC, einmal als JPEG — ergibt dieselbe Datei und
 * damit denselben Schlüssel. Nebenbei macht das die Adresse unveränderlich und
 * erlaubt `Cache-Control: immutable`.
 */
export async function processImage(
  input: Buffer,
  purpose: ImagePurpose,
): Promise<ProcessResult> {
  const variant = IMAGE_VARIANTS[purpose];
  if (input.byteLength > variant.maxBytes) return { ok: false, error: "tooLarge" };
  if (!detectImageType(input)) return { ok: false, error: "notAnImage" };

  try {
    const body = await sharp(input, {
      // Ein animiertes GIF/WebP behält seine Bewegung. Bei einem Avatar ist
      // das oft der Punkt der Sache.
      animated: true,
      // Bremse gegen „Dekompressionsbomben": ein 200-Megapixel-PNG ist als
      // Datei winzig und im Speicher gigantisch.
      limitInputPixels: 100_000_000,
    })
      .rotate() // EXIF-Orientierung anwenden, BEVOR die Metadaten wegfallen
      .resize({
        width: variant.width,
        height: variant.height,
        fit: "cover",
        // Kleine Bilder werden nicht künstlich aufgeblasen — das sieht matschig
        // aus und macht die Datei nur größer.
        withoutEnlargement: true,
      })
      .webp({ quality: variant.quality, effort: 4 })
      .toBuffer();

    return {
      ok: true,
      body,
      contentType: "image/webp",
      extension: "webp",
      hash: createHash("sha256").update(body).digest("base64url").slice(0, 24),
      bytes: body.byteLength,
    };
  } catch (error) {
    // Kaputte oder absichtlich fehlerhafte Dateien landen hier. Der Aufrufer
    // sagt „das war kein Bild" — die Einzelheiten gehören ins Log, nicht in
    // die Oberfläche.
    console.error("[aeli] Bild konnte nicht verarbeitet werden:", error);
    return { ok: false, error: "broken" };
  }
}

/**
 * Der Objektschlüssel.
 *
 * Der Nutzer steht im Pfad, damit sich Speicher und Löschanfragen einem Konto
 * zuordnen lassen; der Zweck, damit man im Bucket ohne Datenbank erkennt, was
 * man vor sich hat; der Hash macht ihn eindeutig und unveränderlich.
 */
export function imageKey(userId: string, purpose: ImagePurpose, hash: string, extension: string): string {
  return `aeli/${userId}/${purpose}-${hash}.${extension}`;
}
