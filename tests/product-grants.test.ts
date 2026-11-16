import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

// What a product unlocks on purchase (`grantsEntitlementKey`), plus the
// required "file for buyers" and the deliberate price choice. Every purchase
// path (Stripe webhook, free claim, Apple) grants exactly this key.

const mocks = vi.hoisted(() => ({
  requireTenantAdmin: vi.fn(),
  writeAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    setTenantContext: vi.fn(),
    systemPrisma: prisma,
    withTenantTransaction: (fn: (tx: typeof prisma) => unknown) => fn(prisma),
  };
});
vi.mock("@/lib/guards", () => ({ requireTenantAdmin: mocks.requireTenantAdmin }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/ai", () => ({ indexContent: vi.fn(), removeFromIndex: vi.fn() }));
vi.mock("@/lib/slug", () => ({ uniqueChildSlug: vi.fn(async () => "kurs-paket") }));
vi.mock("@/lib/plan", async (orig) => ({
  ...(await orig<typeof import("@/lib/plan")>()),
  featureBlocked: vi.fn(async () => null),
}));
vi.mock("@/lib/action-errors", () => ({
  tErr: vi.fn(async (key: string) => key),
  zodErr: vi.fn(async () => "invalidData"),
}));

import prismaModule from "@/lib/prisma";
import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from "@/app/actions/dashboard";

const prisma = prismaModule as unknown as PrismaMock;

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

const base = { tenant: "demo", name: "Kurs-Paket", priceCents: "1499" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTenantAdmin.mockResolvedValue({
    tenant: { id: "t1", slug: "demo" },
    user: { id: "owner" },
    role: "OWNER",
  });
  prisma.product.create.mockResolvedValue({ id: "p1", name: "Kurs-Paket" });
  prisma.product.update.mockResolvedValue({});
  prisma.product.count.mockResolvedValue(0);
  prisma.course.updateMany.mockResolvedValue({ count: 1 });
  prisma.order.count.mockResolvedValue(0);
});

describe("course access products", () => {
  it("require a course", async () => {
    const result = await createProductAction({}, form({ ...base, type: "COURSE_ACCESS" }));
    expect(result).toEqual({ error: "productCourseRequired" });
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it("grant the course key and lock an open course to it", async () => {
    prisma.course.findFirst.mockResolvedValue({
      id: "c1",
      slug: "drehen",
      requiredEntitlementKey: null,
    });
    const result = await createProductAction(
      {},
      form({ ...base, type: "COURSE_ACCESS", courseId: "c1" }),
    );
    expect(result).toEqual({ ok: true });
    expect(prisma.course.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", tenantId: "t1" } }),
    );
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ grantsEntitlementKey: "course:drehen", downloadUrl: null }),
    });
    expect(prisma.course.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", tenantId: "t1", requiredEntitlementKey: null },
      data: { requiredEntitlementKey: "course:drehen" },
    });
  });

  it("refuse a course that belongs to a membership", async () => {
    prisma.course.findFirst.mockResolvedValue({
      id: "c1",
      slug: "drehen",
      requiredEntitlementKey: "tier:premium",
    });
    const result = await createProductAction(
      {},
      form({ ...base, type: "COURSE_ACCESS", courseId: "c1" }),
    );
    expect(result).toEqual({ error: "productCourseGated" });
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it("keep the course once something was sold", async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: "p1",
      slug: "kurs-paket",
      type: "COURSE_ACCESS",
      grantsEntitlementKey: "course:drehen",
    });
    prisma.course.findFirst.mockResolvedValue({
      id: "c2",
      slug: "glasieren",
      requiredEntitlementKey: null,
    });
    prisma.order.count.mockResolvedValue(2);
    const result = await updateProductAction(
      {},
      form({ ...base, productId: "p1", type: "COURSE_ACCESS", courseId: "c2" }),
    );
    expect(result).toEqual({ error: "productGrantLocked" });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("open the course again when its only product is deleted", async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: "p1",
      grantsEntitlementKey: "course:drehen",
    });
    const result = await deleteProductAction(form({ tenant: "demo", productId: "p1" }));
    expect(result).toEqual({ ok: true });
    expect(prisma.course.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", requiredEntitlementKey: "course:drehen" },
      data: { requiredEntitlementKey: null },
    });
  });
});

describe("product form rules", () => {
  it("no longer create membership-access products", async () => {
    const result = await createProductAction({}, form({ ...base, type: "TIER_GRANT" }));
    expect(result).toEqual({ error: "productTypeUnavailable" });
  });

  it("treat an empty price as missing, not as free", async () => {
    const result = await createProductAction(
      {},
      form({ ...base, priceCents: "", type: "BUNDLE" }),
    );
    expect(result).toEqual({ error: "productPriceRequired" });
  });

  it("require a file for digital products", async () => {
    const result = await createProductAction({}, form({ ...base, type: "DIGITAL" }));
    expect(result).toEqual({ error: "productFileRequired" });
  });

  it("accept only http(s) links or own uploads", async () => {
    expect(
      await createProductAction(
        {},
        form({ ...base, type: "DIGITAL", downloadUrl: "javascript:alert(1)" }),
      ),
    ).toEqual({ error: "productFileUrlInvalid" });

    prisma.storageObject.findFirst.mockResolvedValue(null);
    expect(
      await createProductAction(
        {},
        form({ ...base, type: "DIGITAL", downloadUrl: "/api/media/other/file.pdf" }),
      ),
    ).toEqual({ error: "productFileRequired" });

    prisma.storageObject.findFirst.mockResolvedValue({ id: "o1" });
    expect(
      await createProductAction(
        {},
        form({ ...base, type: "DIGITAL", downloadUrl: "/api/media/t1/file.pdf" }),
      ),
    ).toEqual({ ok: true });
    expect(prisma.storageObject.findFirst).toHaveBeenLastCalledWith({
      where: { tenantId: "t1", url: "/api/media/t1/file.pdf" },
      select: { id: true },
    });
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        downloadUrl: "/api/media/t1/file.pdf",
        grantsEntitlementKey: "product:kurs-paket",
      }),
    });
  });
});
