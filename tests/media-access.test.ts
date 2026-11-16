import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    systemPrisma: prisma,
    setTenantContext: vi.fn(),
    withTenantContext: (_: string, fn: () => unknown) => fn(),
  };
});

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  mobileAuth: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/mobile/api", () => ({ mobileAuth: mocks.mobileAuth }));
vi.mock("@/lib/platform-admin", () => ({
  hasPlatformAdminAccess: (user: { platformRole?: string } | null) =>
    user?.platformRole === "ADMIN",
}));
vi.mock("@/lib/storage", () => ({
  getObject: mocks.getObject,
  storageProxyUrl: (key: string) => `/api/media/${key}`,
}));

import { prismaMockRef, type PrismaMock } from "./helpers/prisma-mock";
import { GET } from "@/app/api/media/[...key]/route";

const prisma = () => prismaMockRef.current as PrismaMock;

const TENANT = "tenant_1";
const key = (purpose: string) => `tenants/${TENANT}/${purpose}/0b7c2f1e-1111-4222-8333-944445555666.png`;
const url = (k: string) => `/api/media/${k}`;

function storageObject(purpose: string, visibility: "PUBLIC" | "MEMBERS") {
  const k = key(purpose);
  return {
    id: "obj_1",
    tenantId: TENANT,
    key: k,
    url: url(k),
    purpose,
    contentType: "image/png",
    visibility,
    requiredEntitlementKey: null,
    tenant: { status: "ACTIVE" },
  };
}

const PUBLIC_SPACE = { visibility: "PUBLIC", requiredEntitlementKey: null };
const VIP_SPACE = { visibility: "PAID", requiredEntitlementKey: "tier:vip" };

function postRow(overrides: Record<string, unknown>) {
  return {
    authorId: "creator",
    visibility: "PUBLIC",
    priceCents: 0,
    entitlementKey: null,
    imageUrl: null,
    imageUrls: [],
    coverUrl: null,
    teaserUrl: null,
    videoUrl: null,
    space: PUBLIC_SPACE,
    ...overrides,
  };
}

type Viewer = { id: string; role?: string; keys?: string[] } | null;

function signIn(viewer: Viewer) {
  mocks.getCurrentUser.mockResolvedValue(
    viewer ? { id: viewer.id, accountStatus: "ACTIVE", platformRole: "USER" } : null,
  );
  prisma().membership.findUnique.mockResolvedValue(
    viewer
      ? { status: "ACTIVE", role: viewer.role ?? "MEMBER", joinedAt: new Date("2026-01-01") }
      : null,
  );
  prisma().entitlement.findMany.mockResolvedValue(
    (viewer?.keys ?? []).map((k) => ({ key: k })),
  );
}

async function fetchMedia(k: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/api/media/${k}`, { headers }), {
    params: Promise.resolve({ key: k.split("/") }),
  });
}

describe("/api/media enforces the gate of the referencing content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const p = prisma();
    for (const model of [
      p.post,
      p.mediaItem,
      p.mediaPackage,
      p.course,
      p.lesson,
      p.product,
      p.knowledgeArticle,
    ]) {
      model.findMany.mockResolvedValue([]);
    }
    p.order.findFirst.mockResolvedValue(null);
    p.membershipTier.findFirst.mockResolvedValue(null);
    mocks.mobileAuth.mockResolvedValue(null);
    mocks.getObject.mockResolvedValue({
      body: "bytes",
      contentType: "image/png",
      contentLength: 5,
    });
    signIn(null);
  });

  describe("PPV post media", () => {
    beforeEach(() => {
      const obj = storageObject("feed-image", "PUBLIC");
      prisma().storageObject.findFirst.mockResolvedValue(obj);
      prisma().post.findMany.mockResolvedValue([
        postRow({
          priceCents: 499,
          entitlementKey: "post:p1",
          imageUrl: obj.url,
          imageUrls: [obj.url],
        }),
      ]);
    });

    it("denies anonymous visitors and never serves it publicly cacheable", async () => {
      const res = await fetchMedia(key("feed-image"));
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(mocks.getObject).not.toHaveBeenCalled();
    });

    it("denies a member who has not bought the post", async () => {
      signIn({ id: "member" });
      const res = await fetchMedia(key("feed-image"));
      expect(res.status).toBe(403);
    });

    it("serves the buyer privately", async () => {
      signIn({ id: "buyer", keys: ["post:p1"] });
      const res = await fetchMedia(key("feed-image"));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
      expect(res.headers.get("vary")).toContain("Cookie");
    });

    it("serves staff without a purchase", async () => {
      signIn({ id: "mod", role: "MODERATOR" });
      const res = await fetchMedia(key("feed-image"));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("private");
    });

    it("revokes access once the entitlement is gone (refund)", async () => {
      signIn({ id: "buyer", keys: [] });
      const res = await fetchMedia(key("feed-image"));
      expect(res.status).toBe(403);
    });

    it("accepts the mobile bearer token of a buyer", async () => {
      mocks.getCurrentUser.mockResolvedValue(null);
      mocks.mobileAuth.mockResolvedValue({ id: "buyer", accountStatus: "ACTIVE" });
      prisma().membership.findUnique.mockResolvedValue({
        status: "ACTIVE",
        role: "MEMBER",
        joinedAt: new Date("2026-01-01"),
      });
      prisma().entitlement.findMany.mockResolvedValue([{ key: "post:p1" }]);
      const res = await fetchMedia(key("feed-image"), { authorization: "Bearer token" });
      expect(res.status).toBe(200);
      expect(mocks.mobileAuth).toHaveBeenCalledTimes(1);
    });
  });

  it("gates rich-text body media of a PPV blog post", async () => {
    const obj = storageObject("blog-image", "PUBLIC");
    prisma().storageObject.findFirst.mockResolvedValue(obj);
    // Matched only through bodyHtml: none of the selected URL fields hit.
    prisma().post.findMany.mockResolvedValue([
      postRow({ priceCents: 900, entitlementKey: "post:b1", imageUrl: "/api/media/other.png" }),
    ]);
    signIn({ id: "member" });
    expect((await fetchMedia(obj.key)).status).toBe(403);
    signIn({ id: "buyer", keys: ["post:b1"] });
    expect((await fetchMedia(obj.key)).status).toBe(200);
  });

  it("keeps the PPV teaser public", async () => {
    const obj = storageObject("blog-image", "PUBLIC");
    prisma().storageObject.findFirst.mockResolvedValue(obj);
    prisma().post.findMany.mockResolvedValue([
      postRow({ priceCents: 900, entitlementKey: "post:b1", teaserUrl: obj.url }),
    ]);
    const res = await fetchMedia(obj.key);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
  });

  it("keeps the cover of a members-only post public (advertising)", async () => {
    const obj = storageObject("blog-cover", "PUBLIC");
    prisma().storageObject.findFirst.mockResolvedValue(obj);
    prisma().post.findMany.mockResolvedValue([
      postRow({ visibility: "MEMBERS", imageUrl: obj.url, imageUrls: [obj.url] }),
    ]);
    const res = await fetchMedia(obj.key);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
  });

  describe("paid space media", () => {
    beforeEach(() => {
      const obj = storageObject("space-video", "MEMBERS");
      prisma().storageObject.findFirst.mockResolvedValue(obj);
      prisma().post.findMany.mockResolvedValue([
        postRow({ videoUrl: obj.url, space: VIP_SPACE }),
      ]);
    });

    it("denies a free member", async () => {
      signIn({ id: "free" });
      expect((await fetchMedia(key("space-video"))).status).toBe(403);
    });

    it("serves a member on the required tier", async () => {
      signIn({ id: "vip", keys: ["tier:vip"] });
      const res = await fetchMedia(key("space-video"));
      expect(res.status).toBe(200);
      expect(res.headers.get("vary")).toContain("Cookie");
    });
  });

  it("denies course video to a free member when the course needs a tier", async () => {
    const obj = storageObject("course-video", "MEMBERS");
    prisma().storageObject.findFirst.mockResolvedValue(obj);
    prisma().course.findMany.mockResolvedValue([
      { videoUrl: obj.url, requiredEntitlementKey: "tier:pro", space: { visibility: "MEMBERS", requiredEntitlementKey: null } },
    ]);
    signIn({ id: "free" });
    expect((await fetchMedia(obj.key)).status).toBe(403);
    signIn({ id: "pro", keys: ["tier:pro"] });
    expect((await fetchMedia(obj.key)).status).toBe(200);
  });

  it("denies paid gallery items to a free member but not to the package buyer", async () => {
    const obj = storageObject("gallery", "MEMBERS");
    prisma().storageObject.findFirst.mockResolvedValue(obj);
    prisma().mediaItem.findMany.mockResolvedValue([
      {
        url: obj.url,
        teaserUrl: null,
        isPreview: false,
        priceCents: 0,
        entitlementKey: null,
        package: { priceCents: 1500, entitlementKey: "media:set", space: { visibility: "MEMBERS", requiredEntitlementKey: null } },
      },
    ]);
    signIn({ id: "free" });
    expect((await fetchMedia(obj.key)).status).toBe(403);
    signIn({ id: "buyer", keys: ["media:set"] });
    expect((await fetchMedia(obj.key)).status).toBe(200);
  });

  it("serves product downloads only with a PAID order", async () => {
    const obj = storageObject("library", "MEMBERS");
    prisma().storageObject.findFirst.mockResolvedValue(obj);
    prisma().product.findMany.mockResolvedValue([
      { id: "prod_1", downloadUrl: `https://app.example${obj.url}`, grantsEntitlementKey: null },
    ]);
    signIn({ id: "member" });
    expect((await fetchMedia(obj.key)).status).toBe(403);
    prisma().order.findFirst.mockResolvedValue({ id: "order_1" });
    expect((await fetchMedia(obj.key)).status).toBe(200);
    expect(prisma().order.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: { in: ["prod_1"] }, status: "PAID" }),
      }),
    );
  });

  describe("public media", () => {
    it("serves avatars publicly without resolving content or the viewer", async () => {
      const obj = storageObject("avatar", "PUBLIC");
      prisma().storageObject.findFirst.mockResolvedValue(obj);
      const res = await fetchMedia(obj.key);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("public, max-age=300, stale-while-revalidate=60");
      expect(res.headers.get("vary")).toBeNull();
      expect(prisma().post.findMany).not.toHaveBeenCalled();
      expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    });

    it("keeps images of free public posts publicly cacheable", async () => {
      const obj = storageObject("feed-image", "PUBLIC");
      prisma().storageObject.findFirst.mockResolvedValue(obj);
      prisma().post.findMany.mockResolvedValue([
        postRow({ imageUrl: obj.url, imageUrls: [obj.url] }),
      ]);
      const res = await fetchMedia(obj.key);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("public");
      expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    });

    it("falls back to the upload visibility when nothing references the object", async () => {
      const obj = storageObject("blog-image", "PUBLIC");
      prisma().storageObject.findFirst.mockResolvedValue(obj);
      const res = await fetchMedia(obj.key);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("public");
    });

    it("still requires membership for unreferenced MEMBERS uploads", async () => {
      const obj = storageObject("library", "MEMBERS");
      prisma().storageObject.findFirst.mockResolvedValue(obj);
      expect((await fetchMedia(obj.key)).status).toBe(403);
      signIn({ id: "member" });
      expect((await fetchMedia(obj.key)).status).toBe(200);
    });
  });
});
