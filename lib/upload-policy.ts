/** Shared, side-effect-free upload policy used by API routes and tests. */

export type UploadVisibility = "PUBLIC" | "MEMBERS";
export type UploadKind = "image" | "video" | "audio" | "file";

export interface UploadPurposePolicy {
  visibility: UploadVisibility;
  kinds: readonly UploadKind[];
  maxBytes: number;
}

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * MB;
export const MAX_VIDEO_BYTES = 512 * MB;
export const MAX_AUDIO_BYTES = 256 * MB;
export const MAX_FILE_BYTES = 25 * MB;

const image = (visibility: UploadVisibility): UploadPurposePolicy => ({
  visibility,
  kinds: ["image"],
  maxBytes: MAX_IMAGE_BYTES,
});
const video = (visibility: UploadVisibility): UploadPurposePolicy => ({
  visibility,
  kinds: ["video"],
  maxBytes: MAX_VIDEO_BYTES,
});
const audio = (visibility: UploadVisibility): UploadPurposePolicy => ({
  visibility,
  kinds: ["audio"],
  maxBytes: MAX_AUDIO_BYTES,
});

export const UPLOAD_PURPOSES: Readonly<Record<string, UploadPurposePolicy>> = {
  avatar: image("PUBLIC"),
  logo: image("PUBLIC"),
  cover: image("PUBLIC"),
  "blog-cover": image("PUBLIC"),
  "blog-image": image("PUBLIC"),
  "blog-video": video("PUBLIC"),
  "blog-file": { visibility: "PUBLIC", kinds: ["file"], maxBytes: MAX_FILE_BYTES },
  "feed-image": image("PUBLIC"),
  "ppv-teaser": image("PUBLIC"),
  story: image("PUBLIC"),
  "story-video": video("PUBLIC"),
  planner: image("MEMBERS"),
  "event-cover": image("PUBLIC"),
  "course-cover": image("PUBLIC"),
  "product-cover": image("PUBLIC"),
  announcement: image("PUBLIC"),
  "community-cover": image("PUBLIC"),
  "tier-cover": image("PUBLIC"),
  gallery: {
    visibility: "MEMBERS",
    kinds: ["image", "video"],
    maxBytes: MAX_VIDEO_BYTES,
  },
  "space-video": video("MEMBERS"),
  "course-video": video("MEMBERS"),
  "podcast-cover": image("PUBLIC"),
  "podcast-audio": audio("MEMBERS"),
  "ad-media": {
    visibility: "PUBLIC",
    kinds: ["image", "video"],
    maxBytes: MAX_VIDEO_BYTES,
  },
  "studio-image": image("PUBLIC"),
  "assistant-image": image("PUBLIC"),
  // The media library is private by default. A later publish action can make
  // an object public deliberately; merely uploading it never should.
  library: {
    visibility: "MEMBERS",
    kinds: ["image", "video", "audio"],
    maxBytes: MAX_VIDEO_BYTES,
  },
};

const MIME_KIND: Readonly<Record<string, UploadKind>> = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/avif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/ogg": "video",
  "video/quicktime": "video",
  "video/x-matroska": "video",
  "video/x-m4v": "video",
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
  "audio/mp4": "audio",
  "audio/x-m4a": "audio",
  "audio/aac": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/ogg": "audio",
  // Documents / attachments. Office formats are ZIP containers (PK signature).
  "application/pdf": "file",
  "application/zip": "file",
  "application/x-zip-compressed": "file",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "file",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "file",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "file",
};

export function kindForContentType(contentType: string): UploadKind | null {
  return MIME_KIND[contentType.toLowerCase()] ?? null;
}

export function validateUploadDeclaration(input: {
  purpose: string;
  contentType: string;
  sizeBytes: number;
}):
  | { ok: true; policy: UploadPurposePolicy; kind: UploadKind }
  | { ok: false; error: "purpose" | "type" | "size" } {
  const policy = UPLOAD_PURPOSES[input.purpose];
  if (!policy) return { ok: false, error: "purpose" };
  const kind = kindForContentType(input.contentType);
  if (!kind || !policy.kinds.includes(kind)) return { ok: false, error: "type" };
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > policy.maxBytes
  ) {
    return { ok: false, error: "size" };
  }
  return { ok: true, policy, kind };
}

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((value, index) => bytes[index] === value);
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.slice(start, start + length));

/** Validate actual file signatures rather than trusting browser MIME metadata. */
export function magicBytesMatch(contentType: string, bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  switch (contentType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a";
    case "image/webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case "image/avif": {
      const brand = ascii(bytes, 8, 4);
      return ascii(bytes, 4, 4) === "ftyp" && ["avif", "avis", "mif1"].includes(brand);
    }
    case "video/webm":
    case "video/x-matroska":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "video/ogg":
    case "audio/ogg":
      return ascii(bytes, 0, 4) === "OggS";
    case "audio/wav":
    case "audio/x-wav":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE";
    case "audio/mpeg":
    case "audio/mp3":
      return ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
    case "audio/aac":
      return bytes[0] === 0xff && (bytes[1]! & 0xf6) === 0xf0;
    case "video/mp4":
    case "video/quicktime":
    case "video/x-m4v":
    case "audio/mp4":
    case "audio/x-m4a":
      return ascii(bytes, 4, 4) === "ftyp";
    case "application/pdf":
      return ascii(bytes, 0, 4) === "%PDF";
    case "application/zip":
    case "application/x-zip-compressed":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      // ZIP local-file (PK\x03\x04), empty (PK\x05\x06) or spanned (PK\x07\x08).
      return bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]!);
    default:
      return false;
  }
}
