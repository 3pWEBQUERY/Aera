import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env, storageConfigured } from "./env";

/**
 * Der Bucket von Aeli.
 *
 * Es ist ein eigener Bucket im Railway-Projekt „Aeli.so" (S3-kompatibel, von
 * Tigris betrieben) — nicht der von Aera. Das ist Absicht: die beiden Produkte
 * teilen sich die Datenbank, aber nicht die Dateien. Ein Bucket pro Produkt
 * heisst, dass ein durchgesickerter Schluessel nur die eigene Haelfte oeffnet
 * und dass sich Speicherkosten ohne Rechnerei zuordnen lassen.
 *
 * Railway-Buckets sind privat. Es gibt deshalb keine oeffentliche Adresse pro
 * Objekt; ausgeliefert wird ueber `/api/media/...` (app/api/media/[...key]).
 * Wer den Bucket doch oeffentlich schaltet oder ein CDN davorsetzt, traegt die
 * Basis in `S3_PUBLIC_URL` ein — dann faellt der Umweg weg.
 */

let cached: S3Client | null = null;

function client(): S3Client {
  if (!cached) {
    cached = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      // Railway meldet den Stil pro Bucket („virtual-host" oder „path").
      // Falsch geraten bedeutet 404 auf jedes Objekt, deshalb ist es
      // konfigurierbar und nicht fest verdrahtet.
      forcePathStyle: env.S3_URL_STYLE === "path",
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return cached;
}

/** Steht der Bucket? Fuer die Bereitschaftsanzeige, nicht fuer jeden Upload. */
export async function checkBucket(timeoutMs = 3_000): Promise<boolean> {
  if (!storageConfigured()) return false;
  try {
    await client().send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }), {
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}

export async function putObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      // Die Schluessel tragen den Inhaltshash (siehe lib/images.ts), eine
      // Adresse zeigt also fuer immer auf dasselbe Bild. `immutable` ist hier
      // keine Behauptung, sondern eine Tatsache.
      CacheControl: input.cacheControl ?? "public, max-age=31536000, immutable",
    }),
  );
}

export interface FetchedObject {
  body: ReadableStream;
  contentType: string | null;
  contentLength: number | null;
  etag: string | null;
}

export async function getObject(key: string): Promise<FetchedObject | null> {
  if (!storageConfigured()) return null;
  try {
    const result = await client().send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
    if (!result.Body) return null;
    return {
      body: result.Body.transformToWebStream(),
      contentType: result.ContentType ?? null,
      contentLength: result.ContentLength ?? null,
      etag: result.ETag ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Best effort. Ein Bild, das beim Austauschen nicht geloescht werden konnte,
 * kostet ein paar Kilobyte — ein Fehler an dieser Stelle wuerde dagegen ein
 * erfolgreiches Hochladen als gescheitert aussehen lassen.
 */
export async function deleteObject(key: string): Promise<void> {
  if (!storageConfigured() || !key) return;
  try {
    await client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } catch (error) {
    console.error(`[aeli] Objekt ${key} konnte nicht geloescht werden:`, error);
  }
}

/**
 * Die Adresse, unter der ein Objekt ausgeliefert wird.
 *
 * Ohne `S3_PUBLIC_URL` ist das der eigene Proxy — der einzige Weg, der auch
 * mit einem privaten Bucket funktioniert, und der Normalfall bei Railway.
 */
export function mediaUrl(key: string): string {
  if (env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL}/${key}`;
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Rueckweg: aus einer gespeicherten Adresse wieder den Objektschluessel. Wird
 * gebraucht, um beim Austauschen das alte Bild zu loeschen.
 *
 * Gibt `null` fuer alles zurueck, was nicht aus unserem Bucket stammt — ein
 * Creator darf auch weiterhin eine fremde Bildadresse eintragen, und die darf
 * dieser Pfad niemals anfassen.
 */
export function keyFromMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const decode = (path: string) =>
    path
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
      .join("/");

  if (env.S3_PUBLIC_URL && url.startsWith(`${env.S3_PUBLIC_URL}/`)) {
    return decode(url.slice(env.S3_PUBLIC_URL.length));
  }
  if (url.startsWith("/api/media/")) {
    return decode(url.slice("/api/media/".length));
  }
  return null;
}
