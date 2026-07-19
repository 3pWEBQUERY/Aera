import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    systemPrisma: prisma,
    withTenantTransactionFor: (_tenantId: string, fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
  };
});

import prismaModule from "@/lib/prisma";
import {
  createTenantExport,
  createUserExport,
  DATA_EXPORT_SCHEMA_VERSION,
} from "@/lib/data-export";

const prisma = prismaModule as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$queryRaw.mockResolvedValue([]);
});

describe("streamed data exports", () => {
  it("emits a versioned user manifest with legal and newsletter datasets", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        cursor: "user-1",
        data: {
          id: "user-1",
          email: "member@example.test",
          name: "Member",
          accountStatus: "ACTIVE",
        },
      },
    ]);
    const result = createUserExport({ userId: "user-1" });
    const body = await new Response(result.stream).json();

    expect(body.manifest.schemaVersion).toBe(DATA_EXPORT_SCHEMA_VERSION);
    expect(body.manifest.scope).toBe("user");
    expect(body.manifest.datasets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "legalAcceptances" }),
        expect.objectContaining({ key: "newsletterConsents" }),
        expect.objectContaining({ key: "newsletterConsentEvents" }),
        expect.objectContaining({ key: "newsletterDeliveries" }),
      ]),
    );
    expect(body.data.user).toEqual([
      expect.objectContaining({ id: "user-1", email: "member@example.test" }),
    ]);
    expect(body.summary.counts.user).toBe(1);
  });

  it("rejects dataset names outside the reviewed tenant registry", () => {
    expect(
      createTenantExport({
        tenantId: "tenant-1",
        slug: "demo",
        dataset: "pg_catalog",
        format: "json",
      }),
    ).toBeNull();
  });

  it("retains CSV compatibility for a single tenant dataset", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { cursor: "e1", data: { id: "e1", key: "tier:pro" } },
    ]);
    const result = createTenantExport({
      tenantId: "tenant-1",
      slug: "demo",
      dataset: "entitlements",
      format: "csv",
    });
    expect(result).not.toBeNull();
    const csv = await new Response(result!.stream).text();
    expect(result!.contentType).toContain("text/csv");
    expect(csv).toContain("id,key");
    expect(csv).toContain("e1,tier:pro");
  });
});

