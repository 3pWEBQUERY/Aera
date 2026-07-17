import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import {
  uploadObject,
  isAllowedImage,
  isAllowedVideo,
  extensionFor,
} from "@/lib/storage";
import { storageAllows, formatStorage } from "@/lib/storage-quota";
import { jsonError, jsonOk } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";

// POST /api/mobile/v1/studio/{slug}/upload — multipart `file` + `purpose`
//   → { url }
// Spiegelt app/api/upload/route.ts (MIME-Allowlists, Größenlimits, Plan-Quota,
// Storage-Key-Schema tenants/{id}/{purpose}/{uuid}.{ext}, StorageObject-Zeile).
// Die Mobile-Purposes mappen auf die Web-Purpose-Map (PURPOSE_VISIBILITY):
//   post-image → "feed-image"  (PUBLIC,  nur Bilder)
//   post-video → "space-video" (MEMBERS, nur Videos — Media-Proxy gated)
//   story      → "story" (Bild) bzw. "story-video" (Video), beide PUBLIC
// Rolle ≥ ADMIN via requireStudioAccess (wie der Web-Upload für diese Purposes).

const MAX_IMAGE = 5 * 1024 * 1024; // 5 MB   (wie app/api/upload)
const MAX_VIDEO = 512 * 1024 * 1024; // 512 MB (wie app/api/upload)

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

  const isImage = isAllowedImage(file.type);
  const isVideo = isAllowedVideo(file.type);

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

  const max = isVideo ? MAX_VIDEO : MAX_IMAGE;
  if (file.size > max) {
    return jsonError(
      "validation",
      `file: Too large (max ${formatStorage(max)}).`,
      400,
    );
  }

  // Plan-Speicher-Quota — jeder Upload zählt gegen den Bucket des Tenants.
  const quota = await storageAllows(tenant.id, file.size);
  if (!quota.ok) {
    return jsonError(
      "storage_full",
      `Storage full: ${formatStorage(quota.usedBytes)} of ${formatStorage(quota.limitBytes)} used.`,
      413,
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = `tenants/${tenant.id}/${storagePurpose}/${randomUUID()}.${extensionFor(file.type)}`;

  let uploadedUrl: string;
  try {
    uploadedUrl = await uploadObject({ key, body: bytes, contentType: file.type });
  } catch (e) {
    return jsonError("upload_failed", `Upload failed: ${(e as Error).message}`, 500);
  }

  await prisma.storageObject.create({
    data: {
      tenantId: tenant.id,
      ownerId: user.id,
      key,
      url: uploadedUrl,
      purpose: storagePurpose,
      contentType: file.type,
      sizeBytes: file.size,
      visibility,
    },
  });

  return jsonOk({ url: uploadedUrl });
}
