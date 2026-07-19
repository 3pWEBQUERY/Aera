import "server-only";
import { createHash, randomUUID } from "node:crypto";
import prisma, { withTenantTransactionFor } from "./prisma";
import { getOrCreateWallet } from "./credits";
import { storageLimitBytes } from "./storage-quota";
import type { PlanKey } from "./credit-plans";
import {
  deleteObject,
  storageProxyUrl,
  uploadObject,
} from "./storage";
import type { StorageVisibility } from "@/app/generated/prisma/client";
import { extensionFor } from "./storage";
import { magicBytesMatch, validateUploadDeclaration } from "./upload-policy";
import { scanStoredObject } from "./malware-scan";

const RESERVATION_TTL_MS = 30 * 60_000;

export interface StorageReservationInput {
  tenantId: string;
  ownerId: string;
  purpose: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  visibility: StorageVisibility;
}

export async function reserveStorageUpload(input: StorageReservationInput) {
  const wallet = await getOrCreateWallet(input.tenantId);
  const limitBytes = storageLimitBytes(wallet.plan as PlanKey);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);
  const key = `tenants/${input.tenantId}/${input.purpose}/${randomUUID()}.${extensionFor(input.contentType)}`;

  return withTenantTransactionFor(input.tenantId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${input.tenantId} FOR UPDATE`;
    await tx.storageUploadReservation.updateMany({
      where: { tenantId: input.tenantId, status: "RESERVED", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    // Keep both reads on the same interactive-transaction connection after
    // the tenant row lock. Parallel queries here are adapter-dependent and
    // can accidentally escape the serialization guarantee we rely on.
    const stored = await tx.storageObject.aggregate({
      where: { tenantId: input.tenantId },
      _sum: { sizeBytes: true },
    });
    const reserved = await tx.storageUploadReservation.aggregate({
      where: {
        tenantId: input.tenantId,
        status: "RESERVED",
        expiresAt: { gt: now },
      },
      _sum: { sizeBytes: true },
    });
    const usedBytes = stored._sum.sizeBytes ?? 0;
    const reservedBytes = reserved._sum.sizeBytes ?? 0;
    if (usedBytes + reservedBytes + input.sizeBytes > limitBytes) {
      return { ok: false as const, usedBytes, reservedBytes, limitBytes };
    }
    const reservation = await tx.storageUploadReservation.create({
      data: { ...input, key, expiresAt },
    });
    return {
      ok: true as const,
      reservation,
      usedBytes,
      reservedBytes,
      limitBytes,
    };
  });
}

export async function failStorageReservation(input: {
  tenantId: string;
  reservationId: string;
  key: string;
}): Promise<void> {
  const claimed = await prisma.storageUploadReservation.updateMany({
    where: { id: input.reservationId, tenantId: input.tenantId, status: "RESERVED" },
    data: { status: "FAILED" },
  });
  // A concurrent completion may already have published this key. Only the
  // request that successfully transitions RESERVED -> FAILED may delete the
  // quarantined object; otherwise it would erase a valid StorageObject.
  if (claimed.count !== 1) return;
  await deleteObject(input.key).catch((error) => {
    console.error(`Failed to remove rejected upload ${input.key}:`, error);
  });
}

/** Final CAS: publish one verified object and release its quota reservation. */
export async function completeStorageReservation(input: {
  tenantId: string;
  ownerId: string;
  reservationId: string;
  urlOverride?: string;
}): Promise<{ id: string; url: string } | null> {
  return withTenantTransactionFor(input.tenantId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${input.tenantId} FOR UPDATE`;
    const reservation = await tx.storageUploadReservation.findFirst({
      where: {
        id: input.reservationId,
        tenantId: input.tenantId,
        ownerId: input.ownerId,
      },
    });
    if (!reservation) return null;
    const url = input.urlOverride ?? storageProxyUrl(reservation.key);
    if (reservation.status === "COMPLETED") {
      const existing = await tx.storageObject.findFirst({
        where: { tenantId: input.tenantId, key: reservation.key },
        select: { id: true, url: true },
      });
      return existing ? { id: existing.id, url: existing.url } : null;
    }
    if (reservation.status !== "RESERVED" || reservation.expiresAt <= new Date()) {
      return null;
    }
    const claimed = await tx.storageUploadReservation.updateMany({
      where: { id: reservation.id, status: "RESERVED", expiresAt: { gt: new Date() } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    const object = await tx.storageObject.create({
      data: {
        tenantId: reservation.tenantId,
        ownerId: reservation.ownerId,
        key: reservation.key,
        url,
        purpose: reservation.purpose,
        contentType: reservation.contentType,
        sizeBytes: reservation.sizeBytes,
        visibility: reservation.visibility,
      },
    });
    return { id: object.id, url };
  });
}

export class StorageQuotaExceededError extends Error {}

/** Secure server-side path for small buffers and trusted provider output. */
export async function persistVerifiedBufferUpload(input: {
  tenantId: string;
  ownerId: string;
  purpose: string;
  contentType: string;
  bytes: Buffer | Uint8Array;
  visibility: StorageVisibility;
}): Promise<{ id: string; url: string }> {
  const bytes = Buffer.from(input.bytes);
  const declaration = validateUploadDeclaration({
    purpose: input.purpose,
    contentType: input.contentType,
    sizeBytes: bytes.length,
  });
  if (!declaration.ok || declaration.policy.visibility !== input.visibility) {
    throw new Error("Media upload does not match its purpose policy");
  }
  if (!magicBytesMatch(input.contentType, bytes.subarray(0, 4096))) {
    throw new Error("Media content does not match its declared content type");
  }
  const reserved = await reserveStorageUpload({
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    purpose: input.purpose,
    contentType: input.contentType,
    sizeBytes: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("base64"),
    visibility: input.visibility,
  });
  if (!reserved.ok) throw new StorageQuotaExceededError("Storage quota exceeded");
  try {
    const uploadedUrl = await uploadObject({
      key: reserved.reservation.key,
      body: bytes,
      contentType: input.contentType,
    });
    await scanStoredObject(reserved.reservation.key);
    const completed = await completeStorageReservation({
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      reservationId: reserved.reservation.id,
      urlOverride: uploadedUrl,
    });
    if (!completed) throw new Error("Upload reservation could not be completed");
    return completed;
  } catch (error) {
    await failStorageReservation({
      tenantId: input.tenantId,
      reservationId: reserved.reservation.id,
      key: reserved.reservation.key,
    });
    throw error;
  }
}

/** Privileged cleanup worker for abandoned browser uploads. */
export async function cleanupExpiredStorageReservations(
  limit = 100,
  options: { deadlineAt?: number } = {},
): Promise<number> {
  const now = new Date();
  const expired = await prisma.storageUploadReservation.findMany({
    where: {
      status: { in: ["RESERVED", "FAILED", "EXPIRED"] },
      expiresAt: { lte: now },
    },
    orderBy: { expiresAt: "asc" },
    take: Math.min(Math.max(limit, 1), 500),
    select: { id: true, key: true, status: true },
  });
  let cleaned = 0;
  for (const reservation of expired) {
    // S3 calls may retry. Leave untouched rows for the next run instead of
    // starting work after the global cron budget is exhausted.
    if (options.deadlineAt && Date.now() >= options.deadlineAt - 2_000) break;
    if (reservation.status === "RESERVED") {
      const claimed = await prisma.storageUploadReservation.updateMany({
        where: { id: reservation.id, status: "RESERVED", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      if (claimed.count !== 1) continue;
    }
    let removed = true;
    await deleteObject(reservation.key).catch((error) => {
      removed = false;
      console.error(`Expired upload cleanup failed (${reservation.id}):`, error);
    });
    if (!removed) continue;
    // At this point every presigned URL is expired, so removing the terminal
    // reservation cannot allow a later upload to escape subsequent cleanup.
    await prisma.storageUploadReservation.deleteMany({
      where: {
        id: reservation.id,
        status: { in: ["FAILED", "EXPIRED"] },
        expiresAt: { lte: now },
      },
    });
    cleaned++;
  }
  return cleaned;
}
