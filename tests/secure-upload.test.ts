import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const storageObject = {
    aggregate: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
  };
  const storageUploadReservation = {
    aggregate: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const prisma = {
    storageObject,
    storageUploadReservation,
    $queryRaw: vi.fn(),
  };
  return {
    prisma,
    getOrCreateWallet: vi.fn(),
    deleteObject: vi.fn(),
    uploadObject: vi.fn(),
    scanStoredObject: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  default: mocks.prisma,
  withTenantTransactionFor: (_tenantId: string, fn: (tx: typeof mocks.prisma) => unknown) =>
    fn(mocks.prisma),
}));
vi.mock("@/lib/credits", () => ({ getOrCreateWallet: mocks.getOrCreateWallet }));
vi.mock("@/lib/storage-quota", () => ({ storageLimitBytes: () => 1_000 }));
vi.mock("@/lib/storage", () => ({
  deleteObject: mocks.deleteObject,
  extensionFor: () => "png",
  storageProxyUrl: (key: string) => `/api/media/${key}`,
  uploadObject: mocks.uploadObject,
}));
vi.mock("@/lib/malware-scan", () => ({ scanStoredObject: mocks.scanStoredObject }));

import {
  cleanupExpiredStorageReservations,
  completeStorageReservation,
  persistVerifiedBufferUpload,
  reserveStorageUpload,
  StorageQuotaExceededError,
} from "@/lib/secure-upload";

const input = {
  tenantId: "tenant_1",
  ownerId: "user_1",
  purpose: "library",
  contentType: "image/png",
  sizeBytes: 100,
  checksumSha256: "x".repeat(44),
  visibility: "MEMBERS" as const,
};

describe("secure upload quota reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateWallet.mockResolvedValue({ plan: "FREE" });
    mocks.prisma.storageUploadReservation.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.storageObject.aggregate.mockResolvedValue({ _sum: { sizeBytes: 600 } });
    mocks.prisma.storageUploadReservation.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 300 },
    });
  });

  it("counts active reservations under a tenant row lock", async () => {
    mocks.prisma.storageUploadReservation.create.mockResolvedValue({ id: "reservation_1" });
    const result = await reserveStorageUpload(input);

    expect(result.ok).toBe(true);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.storageUploadReservation.create).toHaveBeenCalledTimes(1);
  });

  it("fails closed when stored + reserved + requested bytes exceed the plan", async () => {
    const result = await reserveStorageUpload({ ...input, sizeBytes: 101 });
    expect(result).toMatchObject({
      ok: false,
      usedBytes: 600,
      reservedBytes: 300,
      limitBytes: 1_000,
    });
    expect(mocks.prisma.storageUploadReservation.create).not.toHaveBeenCalled();
  });

  it("publishes a verified reservation exactly once", async () => {
    mocks.prisma.storageUploadReservation.findFirst.mockResolvedValue({
      id: "reservation_1",
      tenantId: "tenant_1",
      ownerId: "user_1",
      key: "tenants/tenant_1/library/file.png",
      purpose: "library",
      contentType: "image/png",
      sizeBytes: 100,
      visibility: "MEMBERS",
      status: "RESERVED",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.prisma.storageUploadReservation.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.storageObject.create.mockResolvedValue({ id: "object_1" });

    const result = await completeStorageReservation({
      tenantId: "tenant_1",
      ownerId: "user_1",
      reservationId: "reservation_1",
    });

    expect(result).toEqual({
      id: "object_1",
      url: "/api/media/tenants/tenant_1/library/file.png",
    });
    expect(mocks.prisma.storageObject.create).toHaveBeenCalledTimes(1);
  });

  it("claims expired rows before deleting abandoned S3 objects", async () => {
    mocks.prisma.storageUploadReservation.findMany.mockResolvedValue([
      { id: "reservation_1", key: "orphan.png", status: "RESERVED" },
    ]);
    mocks.prisma.storageUploadReservation.updateMany.mockResolvedValue({ count: 1 });
    mocks.deleteObject.mockResolvedValue(undefined);

    await expect(cleanupExpiredStorageReservations()).resolves.toBe(1);
    expect(mocks.deleteObject).toHaveBeenCalledWith("orphan.png");
    expect(mocks.prisma.storageUploadReservation.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("rejects spoofed media before reserving quota", async () => {
    await expect(
      persistVerifiedBufferUpload({
        tenantId: "tenant_1",
        ownerId: "user_1",
        purpose: "studio-image",
        contentType: "image/png",
        bytes: Buffer.from("this is not a png"),
        visibility: "PUBLIC",
      }),
    ).rejects.toThrow("declared content type");
    expect(mocks.prisma.storageUploadReservation.create).not.toHaveBeenCalled();
    expect(mocks.uploadObject).not.toHaveBeenCalled();
  });

  it("fails atomically on quota exhaustion", async () => {
    mocks.prisma.storageObject.aggregate.mockResolvedValue({ _sum: { sizeBytes: 1_000 } });
    mocks.prisma.storageUploadReservation.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 0 },
    });
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);

    await expect(
      persistVerifiedBufferUpload({
        tenantId: "tenant_1",
        ownerId: "user_1",
        purpose: "studio-image",
        contentType: "image/png",
        bytes: png,
        visibility: "PUBLIC",
      }),
    ).rejects.toBeInstanceOf(StorageQuotaExceededError);
    expect(mocks.uploadObject).not.toHaveBeenCalled();
  });

  it("removes quarantined media when malware scanning fails", async () => {
    mocks.prisma.storageObject.aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } });
    mocks.prisma.storageUploadReservation.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 0 },
    });
    mocks.prisma.storageUploadReservation.create.mockResolvedValue({
      id: "reservation_2",
      key: "tenants/tenant_1/studio-image/file.png",
    });
    mocks.uploadObject.mockResolvedValue("/uploads/file.png");
    mocks.scanStoredObject.mockRejectedValue(new Error("malware"));
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.prisma.storageUploadReservation.updateMany.mockResolvedValue({ count: 1 });
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);

    await expect(
      persistVerifiedBufferUpload({
        tenantId: "tenant_1",
        ownerId: "user_1",
        purpose: "studio-image",
        contentType: "image/png",
        bytes: png,
        visibility: "PUBLIC",
      }),
    ).rejects.toThrow("malware");
    expect(mocks.prisma.storageUploadReservation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "reservation_2",
        tenantId: "tenant_1",
        status: "RESERVED",
      },
      data: { status: "FAILED" },
    });
    expect(mocks.deleteObject).toHaveBeenCalledWith(
      "tenants/tenant_1/studio-image/file.png",
    );
  });

  it("does not delete an object already completed by a concurrent request", async () => {
    mocks.prisma.storageUploadReservation.updateMany.mockResolvedValue({ count: 0 });
    mocks.deleteObject.mockResolvedValue(undefined);

    const { failStorageReservation } = await import("@/lib/secure-upload");
    await failStorageReservation({
      tenantId: "tenant_1",
      reservationId: "reservation_1",
      key: "tenants/tenant_1/library/file.png",
    });

    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
