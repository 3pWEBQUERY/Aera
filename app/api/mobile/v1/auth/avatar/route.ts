import { createHash } from "node:crypto";
import prisma, { setTenantContext } from "@/lib/prisma";
import { uploadObject } from "@/lib/storage";
import { jsonError, jsonOk, requireMobileAuth } from "@/lib/mobile/api";
import { magicBytesMatch, validateUploadDeclaration } from "@/lib/upload-policy";
import {
  completeStorageReservation,
  failStorageReservation,
  reserveStorageUpload,
} from "@/lib/secure-upload";
import { scanStoredObject } from "@/lib/malware-scan";

// POST /api/mobile/v1/auth/avatar — multipart `file` + `tenant` (Slug einer
// Mitgliedschaft) → { url }. Spiegelt app/api/upload/route.ts (purpose=avatar):
// eigenes Avatar dürfen alle aktiven Mitglieder hochladen.

const MAX_IMAGE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const contentLength = Number(req.headers.get("content-length"));
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > 6 * 1024 * 1024) {
    return jsonError("validation", "Avatar request body exceeds the 6 MB API limit.", 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("validation", "Expected multipart/form-data with a file field.", 400);
  }
  const slug = String(form.get("tenant") || "");
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("validation", "Missing file field.", 400);
  }
  const declaration = validateUploadDeclaration({
    purpose: "avatar",
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (!declaration.ok) {
    return jsonError("validation", "Only image uploads are allowed for avatars.", 400);
  }
  if (file.size > MAX_IMAGE) {
    return jsonError("validation", "Image exceeds the 5 MB limit.", 400);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) return jsonError("not_found", "Community not found.", 404);
  setTenantContext(tenant.id);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership?.status !== "ACTIVE") {
    return jsonError("not_member", "Active membership required for uploads.", 403);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!magicBytesMatch(file.type, bytes.subarray(0, 4096))) {
    return jsonError("validation", "Avatar content does not match its media type.", 400);
  }
  const reserved = await reserveStorageUpload({
    tenantId: tenant.id,
    ownerId: user.id,
    purpose: "avatar",
    contentType: file.type,
    sizeBytes: file.size,
    checksumSha256: createHash("sha256").update(bytes).digest("base64"),
    visibility: "PUBLIC",
  });
  if (!reserved.ok) {
    return jsonError("validation", "Storage quota exceeded for this community.", 413);
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
    console.error("Mobile avatar upload failed:", error);
    return jsonError("internal", "Upload failed security verification.", 500);
  }
}
