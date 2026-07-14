import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
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

/** Route through our own authenticated proxy so private buckets still work. */
function proxyUrl(key: string): string {
  return "/api/media/" + key.split("/").map(encodeURIComponent).join("/");
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
    return proxyUrl(opts.key);
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
