import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { uploadObject } from "@/lib/storage";
import { authorizeUpload } from "@/lib/upload-access";
import {
  magicBytesMatch,
  validateUploadDeclaration,
} from "@/lib/upload-policy";
import {
  completeStorageReservation,
  failStorageReservation,
  reserveStorageUpload,
} from "@/lib/secure-upload";

// Local-development fallback only. Production media takes the signed direct
// path and therefore never enters Next.js request memory.
const MAX_BUFFERED_BODY = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const t = await getTranslations("uiMigration.dashboard");
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: t("uploadFailed"), directUploadRequired: true },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }
  const contentLength = Number(req.headers.get("content-length"));
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_BUFFERED_BODY
  ) {
    return NextResponse.json({ error: t("uploadFailed") }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: t("uploadFailed") }, { status: 400 });
  const slug = String(form.get("tenant") || "");
  const purpose = String(form.get("purpose") || "avatar");
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: t("noFile") }, { status: 400 });
  }

  const declaration = validateUploadDeclaration({
    purpose,
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (!declaration.ok) {
    return NextResponse.json(
      {
        error:
          declaration.error === "purpose"
            ? t("invalidUploadPurpose")
            : declaration.error === "type"
              ? t("unsupportedMedia")
              : t("uploadFailed"),
      },
      { status: 400 },
    );
  }
  const access = await authorizeUpload(user, slug, purpose);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!magicBytesMatch(file.type, bytes.subarray(0, 4096))) {
    return NextResponse.json({ error: t("unsupportedMedia") }, { status: 400 });
  }
  const checksumSha256 = createHash("sha256").update(bytes).digest("base64");
  const reserved = await reserveStorageUpload({
    tenantId: access.tenant.id,
    ownerId: user.id,
    purpose,
    contentType: file.type,
    sizeBytes: file.size,
    checksumSha256,
    visibility: declaration.policy.visibility,
  });
  if (!reserved.ok) {
    return NextResponse.json(
      { error: t("uploadFailed"), storageFull: true },
      { status: 413 },
    );
  }

  try {
    const uploadedUrl = await uploadObject({
      key: reserved.reservation.key,
      body: bytes,
      contentType: file.type,
    });
    const completed = await completeStorageReservation({
      tenantId: access.tenant.id,
      ownerId: user.id,
      reservationId: reserved.reservation.id,
      urlOverride: uploadedUrl,
    });
    if (!completed) throw new Error("Reservation could not be completed");
    return NextResponse.json(completed);
  } catch (error) {
    await failStorageReservation({
      tenantId: access.tenant.id,
      reservationId: reserved.reservation.id,
      key: reserved.reservation.key,
    });
    console.error("Buffered development upload failed:", error);
    return NextResponse.json({ error: t("uploadFailed") }, { status: 500 });
  }
}
