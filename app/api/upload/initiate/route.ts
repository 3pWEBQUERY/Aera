import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { features } from "@/lib/env";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { authorizeUpload } from "@/lib/upload-access";
import { validateUploadDeclaration } from "@/lib/upload-policy";
import { reserveStorageUpload, failStorageReservation } from "@/lib/secure-upload";
import { createDirectUploadAuthorization } from "@/lib/storage";

const noStore = { "Cache-Control": "no-store" };

function validSha256(value: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  return Buffer.from(value, "base64").length === 32;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (!(await rateLimit(`upload:init:${user.id}:${await clientIp()}`, 60, 60 * 60_000))) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429, headers: noStore });
  }

  const body = (await request.json().catch(() => null)) as null | {
    tenant?: unknown;
    purpose?: unknown;
    contentType?: unknown;
    sizeBytes?: unknown;
    checksumSha256?: unknown;
  };
  const slug = typeof body?.tenant === "string" ? body.tenant : "";
  const purpose = typeof body?.purpose === "string" ? body.purpose : "";
  const contentType = typeof body?.contentType === "string" ? body.contentType.toLowerCase() : "";
  const sizeBytes = typeof body?.sizeBytes === "number" ? body.sizeBytes : 0;
  const checksumSha256 =
    typeof body?.checksumSha256 === "string" ? body.checksumSha256 : "";
  const declaration = validateUploadDeclaration({ purpose, contentType, sizeBytes });
  if (!declaration.ok || !validSha256(checksumSha256)) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400, headers: noStore });
  }
  const access = await authorizeUpload(user, slug, purpose);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });

  // Local development retains the small buffered fallback. Production S3
  // never sends media through the application process.
  if (!features.storage) {
    return NextResponse.json({ direct: false }, { headers: noStore });
  }

  const reserved = await reserveStorageUpload({
    tenantId: access.tenant.id,
    ownerId: user.id,
    purpose,
    contentType,
    sizeBytes,
    checksumSha256,
    visibility: declaration.policy.visibility,
  });
  if (!reserved.ok) {
    return NextResponse.json(
      { error: "Storage quota exceeded", storageFull: true },
      { status: 413, headers: noStore },
    );
  }

  try {
    const authorization = await createDirectUploadAuthorization({
      key: reserved.reservation.key,
      contentType,
      sizeBytes,
      checksumSha256,
      reservationId: reserved.reservation.id,
    });
    return NextResponse.json(
      {
        direct: true,
        reservationId: reserved.reservation.id,
        uploadUrl: authorization.url,
        headers: authorization.headers,
        expiresInSeconds: authorization.expiresInSeconds,
      },
      { headers: noStore },
    );
  } catch (error) {
    await failStorageReservation({
      tenantId: access.tenant.id,
      reservationId: reserved.reservation.id,
      key: reserved.reservation.key,
    });
    console.error("Direct upload authorization failed:", error);
    return NextResponse.json({ error: "Upload unavailable" }, { status: 503, headers: noStore });
  }
}
