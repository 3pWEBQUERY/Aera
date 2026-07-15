import { randomUUID } from "crypto";
import prisma, { setTenantContext } from "@/lib/prisma";
import { uploadObject, isAllowedImage, extensionFor } from "@/lib/storage";
import { storageAllows } from "@/lib/storage-quota";
import { jsonError, jsonOk, requireMobileAuth } from "@/lib/mobile/api";

// POST /api/mobile/v1/auth/avatar — multipart `file` + `tenant` (Slug einer
// Mitgliedschaft) → { url }. Spiegelt app/api/upload/route.ts (purpose=avatar):
// eigenes Avatar dürfen alle aktiven Mitglieder hochladen.

const MAX_IMAGE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

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
  if (!isAllowedImage(file.type)) {
    return jsonError("validation", "Only image uploads are allowed for avatars.", 400);
  }
  if (file.size > MAX_IMAGE) {
    return jsonError("validation", "Image exceeds the 5 MB limit.", 400);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return jsonError("not_found", "Community not found.", 404);
  setTenantContext(tenant.id);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership?.status !== "ACTIVE") {
    return jsonError("not_member", "Active membership required for uploads.", 403);
  }

  const quota = await storageAllows(tenant.id, file.size);
  if (!quota.ok) {
    return jsonError("validation", "Storage quota exceeded for this community.", 413);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = `tenants/${tenant.id}/avatar/${randomUUID()}.${extensionFor(file.type)}`;
  let url: string;
  try {
    url = await uploadObject({ key, body: bytes, contentType: file.type });
  } catch (e) {
    return jsonError("internal", `Upload failed: ${(e as Error).message}`, 500);
  }

  await prisma.storageObject.create({
    data: {
      tenantId: tenant.id,
      ownerId: user.id,
      key,
      url,
      purpose: "avatar",
      contentType: file.type,
      sizeBytes: file.size,
      visibility: "PUBLIC",
    },
  });

  return jsonOk({ url });
}
