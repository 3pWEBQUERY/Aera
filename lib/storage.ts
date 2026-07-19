import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { env, features } from "./env";

let _s3: S3Client | null = null;
function client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true, // required for most S3-compatible buckets (Railway/Tigris/MinIO)
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return _s3;
}

/** Lightweight readiness probe for the private object-storage bucket. */
export async function checkStorageHealth(timeoutMs = 2_500): Promise<boolean> {
  if (!features.storage) return false;
  try {
    await client().send(
      new HeadBucketCommand({ Bucket: env.S3_BUCKET }),
      { abortSignal: AbortSignal.timeout(timeoutMs) },
    );
    return true;
  } catch {
    return false;
  }
}

/** Route through our own authenticated proxy so private buckets still work. */
export function storageProxyUrl(key: string): string {
  return "/api/media/" + key.split("/").map(encodeURIComponent).join("/");
}

export interface DirectUploadAuthorization {
  url: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/** Create a short-lived, checksum-bound browser-to-private-S3 PUT URL. */
export async function createDirectUploadAuthorization(input: {
  key: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  reservationId: string;
}): Promise<DirectUploadAuthorization> {
  if (!features.storage) {
    throw new Error("Private object storage is not configured");
  }
  const expiresInSeconds = 15 * 60;
  const headers = {
    "Content-Type": input.contentType,
    "x-amz-checksum-sha256": input.checksumSha256,
    "x-amz-meta-aera-upload-id": input.reservationId,
  };
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.sizeBytes,
    ChecksumSHA256: input.checksumSha256,
    Metadata: { "aera-upload-id": input.reservationId },
  });
  const url = await getSignedUrl(client(), command, {
    expiresIn: expiresInSeconds,
    // Keep integrity + reservation binding as signed request headers instead
    // of hoisting them into a reusable query string.
    unhoistableHeaders: new Set([
      "x-amz-checksum-sha256",
      "x-amz-meta-aera-upload-id",
    ]),
  });
  return { url, headers, expiresInSeconds };
}

export interface StoredObjectMetadata {
  sizeBytes: number;
  contentType: string | null;
  checksumSha256: string | null;
  uploadReservationId: string | null;
}

export async function inspectStoredObject(key: string): Promise<StoredObjectMetadata | null> {
  if (!features.storage) return null;
  try {
    const result = await client().send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        ChecksumMode: "ENABLED",
      }),
    );
    return {
      sizeBytes: result.ContentLength ?? -1,
      contentType: result.ContentType ?? null,
      checksumSha256: result.ChecksumSHA256 ?? null,
      uploadReservationId: result.Metadata?.["aera-upload-id"] ?? null,
    };
  } catch {
    return null;
  }
}

/** Read only the prefix needed for magic-byte validation. */
export async function readObjectPrefix(key: string, maxBytes = 4096): Promise<Uint8Array | null> {
  const object = await getObject(key, `bytes=0-${Math.max(15, maxBytes - 1)}`);
  if (!object) return null;
  const reader = object.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - total;
      const chunk = value.length > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function deleteObject(key: string): Promise<void> {
  if (!features.storage) return;
  await client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

export interface StoredObjectListItem {
  key: string;
  lastModified: Date | null;
  sizeBytes: number;
}

export interface StoredObjectListPage {
  objects: StoredObjectListItem[];
  continuationToken: string | null;
}

/**
 * List one bounded S3 page. Lifecycle workers persist the opaque continuation
 * token between runs, so even very large tenant prefixes are reconciled
 * without loading the bucket inventory into memory.
 */
export async function listStoredObjectsPage(input: {
  prefix: string;
  continuationToken?: string | null;
  maxKeys?: number;
}): Promise<StoredObjectListPage> {
  if (!features.storage) return { objects: [], continuationToken: null };
  const result = await client().send(
    new ListObjectsV2Command({
      Bucket: env.S3_BUCKET,
      Prefix: input.prefix,
      ContinuationToken: input.continuationToken ?? undefined,
      MaxKeys: Math.min(1_000, Math.max(1, input.maxKeys ?? 500)),
    }),
  );
  return {
    objects: (result.Contents ?? []).flatMap((object) =>
      object.Key
        ? [{
            key: object.Key,
            lastModified: object.LastModified ?? null,
            sizeBytes: object.Size ?? 0,
          }]
        : [],
    ),
    continuationToken: result.IsTruncated
      ? result.NextContinuationToken ?? null
      : null,
  };
}

/**
 * Upload a binary object. Uses a private Railway S3 bucket when configured;
 * otherwise falls back to `public/uploads` in development only.
 * Returns a URL that reliably renders the object:
 *  - S3 (private bucket)     -> /api/media/<key> authenticated proxy
 *  - no S3                   -> /uploads/<file> (dev fallback)
 */
export async function uploadObject(opts: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<string> {
  if (features.storage) {
    await client().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: opts.key,
        Body: opts.body,
        ContentType: opts.contentType,
      }),
    );
    return storageProxyUrl(opts.key);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Private object storage is required for uploads in production.");
  }

  // Development-only fallback (no S3 credentials configured).
  const filename = opts.key.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), opts.body);
  return `/uploads/${filename}`;
}

export interface FetchedObject {
  /** Streamed straight from S3 — objects are never buffered in memory. */
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  contentRange?: string;
  contentLength?: number;
}

/**
 * Fetch an object from S3 (used by the media proxy route). Supports an optional
 * HTTP Range so videos can be streamed/seeked without loading the whole file.
 */
export async function getObject(
  key: string,
  range?: string,
): Promise<FetchedObject | null> {
  if (!features.storage) return null;
  try {
    const res = await client().send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        ...(range ? { Range: range } : {}),
      }),
    );
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
      contentType: res.ContentType,
      contentRange: res.ContentRange,
      contentLength: res.ContentLength,
    };
  } catch {
    return null;
  }
}

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/x-m4v": "m4v",
};
const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};
const EXT: Record<string, string> = { ...IMAGE_EXT, ...VIDEO_EXT, ...AUDIO_EXT };

export function isAllowedImage(contentType: string): boolean {
  return contentType in IMAGE_EXT;
}

export function isAllowedVideo(contentType: string): boolean {
  return contentType in VIDEO_EXT;
}

export function isAllowedAudio(contentType: string): boolean {
  return contentType in AUDIO_EXT;
}

export function extensionFor(contentType: string): string {
  return EXT[contentType] ?? "bin";
}
