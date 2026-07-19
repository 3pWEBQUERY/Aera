import { createHash } from "node:crypto";
import { uploadObject } from "@/lib/storage";
import { formatStorage } from "@/lib/storage-quota";
import { jsonError, jsonOk } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";
import { magicBytesMatch, validateUploadDeclaration } from "@/lib/upload-policy";
import {
  completeStorageReservation,
  failStorageReservation,
  reserveStorageUpload,
} from "@/lib/secure-upload";
import { scanStoredObject } from "@/lib/malware-scan";

// POST /api/mobile/v1/studio/{slug}/upload — multipart `file` + `purpose`
//   → { url }
// Spiegelt app/api/upload/route.ts (MIME-Allowlists, Größenlimits, Plan-Quota,
// Storage-Key-Schema tenants/{id}/{purpose}/{uuid}.{ext}, StorageObject-Zeile).
// Die Mobile-Purposes mappen auf die Web-Purpose-Map (PURPOSE_VISIBILITY):
//   post-image → "feed-image"  (PUBLIC,  nur Bilder)
//   post-video → "space-video" (MEMBERS, nur Videos — Media-Proxy gated)
//   story      → "story" (Bild) bzw. "story-video" (Video), beide PUBLIC
// Rolle ≥ ADMIN via requireStudioAccess (wie der Web-Upload für diese Purposes).

const MAX_BUFFERED_BODY = 10 * 1024 * 1024;

const PURPOSES = ["post-image", "post-video", "story"] as const;
type Purpose = (typeof PURPOSES)[number];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant, user } = access;

  const contentLength = Number(req.headers.get("content-length"));
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > MAX_BUFFERED_BODY) {
    return jsonError("validation", "Upload body is missing or exceeds the 10 MB API limit.", 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("validation", "Request body must be multipart/form-data.", 400);
  }
  const purpose = String(form.get("purpose") || "") as Purpose;
  const file = form.get("file");
  if (!PURPOSES.includes(purpose)) {
    return jsonError(
      "validation",
      `purpose: Must be one of ${PURPOSES.join(", ")}.`,
      400,
    );
  }
  if (!(file instanceof File)) {
    return jsonError("validation", "file: A file is required.", 400);
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  // Mobile-Purpose → Web-Storage-Purpose + Visibility (PURPOSE_VISIBILITY).
  let storagePurpose: string;
  let visibility: "PUBLIC" | "MEMBERS";
  if (purpose === "post-image") {
    if (!isImage) return jsonError("validation", "file: Image required (jpeg/png/webp/gif/avif).", 400);
    storagePurpose = "feed-image";
    visibility = "PUBLIC";
  } else if (purpose === "post-video") {
    if (!isVideo) return jsonError("validation", "file: Video required (mp4/webm/ogv/mov/mkv/m4v).", 400);
    storagePurpose = "space-video";
    visibility = "MEMBERS";
  } else {
    // story: Bild oder Video, jeweils PUBLIC wie im Web ("story"/"story-video").
    if (!isImage && !isVideo) {
      return jsonError("validation", "file: Image or video required.", 400);
    }
    storagePurpose = isVideo ? "story-video" : "story";
    visibility = "PUBLIC";
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const declaration = validateUploadDeclaration({
    purpose: storagePurpose,
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (!declaration.ok || !magicBytesMatch(file.type, bytes.subarray(0, 4096))) {
    return jsonError("validation", "File content does not match the declared media type.", 400);
  }
  const reserved = await reserveStorageUpload({
    tenantId: tenant.id,
    ownerId: user.id,
    purpose: storagePurpose,
    contentType: file.type,
    sizeBytes: file.size,
    checksumSha256: createHash("sha256").update(bytes).digest("base64"),
    visibility,
  });
  if (!reserved.ok) {
    return jsonError(
      "storage_full",
      `Storage full: ${formatStorage(reserved.usedBytes + reserved.reservedBytes)} of ${formatStorage(reserved.limitBytes)} used.`,
      413,
    );
  }
  try {
    const uploadedUrl = await uploadObject({
      key: reserved.reservation.key,
      body: bytes,
      contentType: file.type,
    });
    await scanStoredObject(reserved.reservation.key);
    const completed = await completeStorageReservation({
      tenantId: tenant.id,
      ownerId: user.id,
      reservationId: reserved.reservation.id,
      urlOverride: uploadedUrl,
    });
    if (!completed) throw new Error("Upload reservation could not be completed");
    return jsonOk(completed);
  } catch (error) {
    await failStorageReservation({
      tenantId: tenant.id,
      reservationId: reserved.reservation.id,
      key: reserved.reservation.key,
    });
    console.error("Mobile studio upload failed:", error);
    return jsonError("upload_failed", "Upload failed security verification.", 500);
  }
}
