import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { authorizeUpload } from "@/lib/upload-access";
import { magicBytesMatch } from "@/lib/upload-policy";
import {
  completeStorageReservation,
  failStorageReservation,
} from "@/lib/secure-upload";
import { inspectStoredObject, readObjectPrefix } from "@/lib/storage";
import { scanStoredObject } from "@/lib/malware-scan";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (!(await rateLimit(`upload:complete:${user.id}:${await clientIp()}`, 120, 60 * 60_000))) {
    return NextResponse.json({ error: "Too many uploads" }, { status: 429, headers: noStore });
  }
  const body = (await request.json().catch(() => null)) as null | {
    tenant?: unknown;
    reservationId?: unknown;
  };
  const slug = typeof body?.tenant === "string" ? body.tenant : "";
  const reservationId =
    typeof body?.reservationId === "string" ? body.reservationId : "";
  if (!reservationId) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400, headers: noStore });
  }

  // Purpose is read only after tenant scoping, then the same authorization
  // boundary as initiation is re-evaluated (membership may have changed).
  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const preliminary = await authorizeUpload(user, slug, "avatar");
  if (!preliminary) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const reservation = await prisma.storageUploadReservation.findFirst({
    where: { id: reservationId, tenantId: tenant.id, ownerId: user.id },
  });
  if (!reservation) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const access = await authorizeUpload(user, slug, reservation.purpose);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  if (reservation.status === "COMPLETED") {
    const completed = await completeStorageReservation({
      tenantId: tenant.id,
      ownerId: user.id,
      reservationId,
    });
    return completed
      ? NextResponse.json(completed, { headers: noStore })
      : NextResponse.json({ error: "Upload unavailable" }, { status: 409, headers: noStore });
  }

  try {
    if (reservation.status !== "RESERVED" || reservation.expiresAt <= new Date()) {
      throw new Error("Upload reservation expired");
    }
    const [metadata, prefix] = await Promise.all([
      inspectStoredObject(reservation.key),
      readObjectPrefix(reservation.key),
    ]);
    if (
      !metadata ||
      metadata.sizeBytes !== reservation.sizeBytes ||
      metadata.contentType !== reservation.contentType ||
      metadata.checksumSha256 !== reservation.checksumSha256 ||
      metadata.uploadReservationId !== reservation.id ||
      !prefix ||
      !magicBytesMatch(reservation.contentType, prefix)
    ) {
      throw new Error("Uploaded object did not match its signed declaration");
    }
    await scanStoredObject(reservation.key);
    const completed = await completeStorageReservation({
      tenantId: tenant.id,
      ownerId: user.id,
      reservationId,
    });
    if (!completed) throw new Error("Upload reservation could not be completed");
    return NextResponse.json(completed, { headers: noStore });
  } catch (error) {
    await failStorageReservation({
      tenantId: tenant.id,
      reservationId,
      key: reservation.key,
    });
    console.error(`Upload verification failed (${reservationId}):`, error);
    return NextResponse.json({ error: "Upload rejected" }, { status: 422, headers: noStore });
  }
}
