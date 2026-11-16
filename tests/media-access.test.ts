import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getObject: vi.fn(),
  hasPlatformAdminAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return {
    default: prisma,
    prisma,
    setTenantContext: vi.fn(),
    withTenantContext: (_: string, fn: () => unknown) => fn(),
  };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/platform-admin", () => ({ hasPlatformAdminAccess: mocks.hasPlatformAdminAccess }));
vi.mock("@/lib/storage", () => ({
  getObject: mocks.getObject,
  storageProxyUrl: (key: string) =>
    "/api/media/" + key.split("/").map(encodeURIComponent).join("/"),
}));

import prismaModule from "@/lib/prisma";
import type { AccessContext } from "@/lib/entitlements";
import {
  ANONYMOUS_ACCESS,
  canViewMedia,
  canViewMediaReference,
  findMediaReferences,
  type MediaReference,
} from "@/lib/media-access";
import { UPLOAD_PURPOSES } from "@/lib/upload-policy";
import { GET } from "@/app/api/media/[...key]/route";

const prisma = prismaModule as unknown as PrismaMock;

const NOW = new Date("2026-06-01T12:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");

function member(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: "u1",
    membership: {
      id: "m1",
      tenantId: "t1",
      userId: "u1",
      role: "MEMBER",
      status: "ACTIVE",
      tierId: null,
      joinedAt: PAST,
    } as AccessContext["membership"],
    role: "MEMBER",
    keys: new Set<string>(),
    isStaff: false,
    hasPaidEntitlement: false,
    ...overrides,
  };
}

const publicSpace = { visibility: "PUBLIC" as const, requiredEntitlementKey: null };
const vipSpace = { visibility: "PAID" as const, requiredEntitlementKey: "tier:vip" };

function postRef(
  post: Partial<Extract<MediaReference, { kind: "post" }>["post"]> = {},
  extra: { field?: "content" | "cover"; space?: typeof publicSpace | typeof vipSpace } = {},
): MediaReference {
  return {
    kind: "post",
    field: extra.field ?? "content",
    space: extra.space ?? publicSpace,
    post: {
      visibility: "PUBLIC",
      priceCents: 0,
      entitlementKey: null,
      authorId: "author",
      isPublished: true,
      publishedAt: PAST,
      ...post,
    },
  };
}

const ppvPost = { priceCents: 990, entitlementKey: "post:p1" };

describe("media follows the gate of the post that uses it", () => {
  it("locks pay-per-view post media for visitors and free members, opens it for buyers and staff", () => {
    const ref = postRef(ppvPost);
    expect(canViewMediaReference(ref, ANONYMOUS_ACCESS, NOW)).toBe(false);
    expect(canViewMediaReference(ref, member(), NOW)).toBe(false);
    expect(canViewMediaReference(ref, member({ keys: new Set(["post:p1"]) }), NOW)).toBe(true);
    expect(canViewMediaReference(ref, member({ isStaff: true }), NOW)).toBe(true);
    expect(canViewMediaReference(ref, member({ userId: "author" }), NOW)).toBe(true);
  });

  it("keeps media of members-only posts away from visitors", () => {
    const ref = postRef({ visibility: "MEMBERS" });
    expect(canViewMediaReference(ref, ANONYMOUS_ACCESS, NOW)).toBe(false);
    expect(canViewMediaReference(ref, member(), NOW)).toBe(true);
  });

  it("leaves media of free public posts public", () => {
    expect(canViewMediaReference(postRef(), ANONYMOUS_ACCESS, NOW)).toBe(true);
  });

  it("shows the cover of a members-only post as its advert, but not of a sold post", () => {
    const membersCover = postRef({ visibility: "MEMBERS" }, { field: "cover" });
    expect(canViewMediaReference(membersCover, ANONYMOUS_ACCESS, NOW)).toBe(true);
    const paidCover = postRef(ppvPost, { field: "cover" });
    expect(canViewMediaReference(paidCover, member(), NOW)).toBe(false);
  });

  it("hides drafts and scheduled posts from everyone but staff and the author", () => {
    const draft = postRef({ isPublished: false });
    const scheduled = postRef({ publishedAt: new Date("2026-07-01T00:00:00Z") });
    for (const ref of [draft, scheduled]) {
      expect(canViewMediaReference(ref, ANONYMOUS_ACCESS, NOW)).toBe(false);
      expect(canViewMediaReference(ref, member(), NOW)).toBe(false);
      expect(canViewMediaReference(ref, member({ isStaff: true }), NOW)).toBe(true);
    }
  });

  it("opens the file when any of the posts that use it grants access", () => {
    const object = { purpose: "blog-image", visibility: "MEMBERS" as const, requiredEntitlementKey: null };
    const refs = [postRef(ppvPost), postRef()];
    expect(canViewMedia(object, refs, ANONYMOUS_ACCESS, NOW)).toBe(true);
    expect(canViewMedia(object, [postRef(ppvPost)], ANONYMOUS_ACCESS, NOW)).toBe(false);
  });
});

describe("paid-space media", () => {
  const vip = member({ keys: new Set(["tier:vip"]), hasPaidEntitlement: true });

  it("keeps a public post in a paid space away from free members", () => {
    const ref = postRef({}, { space: vipSpace });
    expect(canViewMediaReference(ref, ANONYMOUS_ACCESS, NOW)).toBe(false);
    expect(canViewMediaReference(ref, member(), NOW)).toBe(false);
    expect(canViewMediaReference(ref, vip, NOW)).toBe(true);
  });

  it("gates course and lesson videos by space, course key, preview and drip", () => {
    const course = { isPublished: true, requiredEntitlementKey: "product:course" };
    const courseRef: MediaReference = { kind: "course", space: vipSpace, course };
    expect(canViewMediaReference(courseRef, member(), NOW)).toBe(false);
    expect(canViewMediaReference(courseRef, vip, NOW)).toBe(false);
    const buyer = member({ keys: new Set(["tier:vip", "product:course"]), hasPaidEntitlement: true });
    expect(canViewMediaReference(courseRef, buyer, NOW)).toBe(true);

    const preview: MediaReference = {
      kind: "lesson",
      space: vipSpace,
      course,
      lesson: { isPreview: true, dripAfterDays: null },
    };
    expect(canViewMediaReference(preview, vip, NOW)).toBe(true);
    expect(canViewMediaReference(preview, member(), NOW)).toBe(false);

    const dripped: MediaReference = {
      kind: "lesson",
      space: vipSpace,
      course,
      lesson: { isPreview: false, dripAfterDays: 30 },
    };
    const newBuyer = member({
      keys: buyer.keys,
      hasPaidEntitlement: true,
      membership: { ...buyer.membership!, joinedAt: new Date("2026-05-25T00:00:00Z") },
    });
    expect(canViewMediaReference(dripped, newBuyer, NOW)).toBe(false);
    expect(canViewMediaReference(dripped, buyer, NOW)).toBe(true);
  });

  it("gates gallery items by package purchase, single-item purchase and preview", () => {
    const base = {
      kind: "media-item" as const,
      space: { visibility: "MEMBERS" as const, requiredEntitlementKey: null },
      mediaPackage: {
        isPublished: true,
        availableUntil: null,
        priceCents: 1900,
        entitlementKey: "media:shoot",
      },
    };
    const item: MediaReference = {
      ...base,
      field: "content",
      item: { isPreview: false, priceCents: 300, entitlementKey: "media-item:i1" },
    };
    expect(canViewMediaReference(item, member(), NOW)).toBe(false);
    expect(canViewMediaReference(item, member({ keys: new Set(["media:shoot"]) }), NOW)).toBe(true);
    expect(canViewMediaReference(item, member({ keys: new Set(["media-item:i1"]) }), NOW)).toBe(true);
    const teaser: MediaReference = { ...item, field: "teaser" };
    expect(canViewMediaReference(teaser, member(), NOW)).toBe(true);
    expect(canViewMediaReference(teaser, ANONYMOUS_ACCESS, NOW)).toBe(false);
  });
});

describe("unreferenced files", () => {
  it("defaults post and paid-space media purposes to at least MEMBERS", () => {
    for (const purpose of [
      "blog-image",
      "blog-video",
      "blog-file",
      "feed-image",
      "feed-video",
      "course-video",
      "space-video",
      "music-audio",
      "podcast-audio",
      "gallery",
    ]) {
      expect(UPLOAD_PURPOSES[purpose]?.visibility, purpose).toBe("MEMBERS");
    }
  });

  it("raises legacy PUBLIC rows of gated purposes to the current default", () => {
    const legacy = { purpose: "blog-image", visibility: "PUBLIC" as const, requiredEntitlementKey: null };
    expect(canViewMedia(legacy, [], ANONYMOUS_ACCESS, NOW)).toBe(false);
    expect(canViewMedia(legacy, [], member(), NOW)).toBe(true);
    // Purposes that are public by definition are left alone.
    const avatar = { purpose: "avatar", visibility: "PUBLIC" as const, requiredEntitlementKey: null };
    expect(canViewMedia(avatar, null, ANONYMOUS_ACCESS, NOW)).toBe(true);
  });
});

describe("findMediaReferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of [prisma.post, prisma.course, prisma.lesson, prisma.mediaItem, prisma.communityPage]) {
      model.findMany.mockResolvedValue([]);
    }
  });

  it("tells covers, media fields and embeds apart and searches page blocks", async () => {
    const url = "/api/media/tenants/t1/blog-image/a.png";
    const post = {
      visibility: "PUBLIC",
      priceCents: 0,
      entitlementKey: null,
      authorId: "a",
      isPublished: true,
      publishedAt: PAST,
      space: publicSpace,
    };
    prisma.post.findMany.mockResolvedValue([
      { ...post, imageUrl: null, imageUrls: [], videoUrl: null, coverUrl: url },
      { ...post, imageUrl: null, imageUrls: [url], videoUrl: null, coverUrl: null },
      { ...post, imageUrl: null, imageUrls: [], videoUrl: null, coverUrl: null },
    ]);
    prisma.communityPage.findMany.mockResolvedValue([
      { status: "PUBLISHED", visibility: "PUBLIC", requiredEntitlementKey: null, blocks: [{ html: `<img src="${url}">` }] },
      { status: "PUBLISHED", visibility: "PUBLIC", requiredEntitlementKey: null, blocks: [{ html: "<p>x</p>" }] },
    ]);

    const refs = await findMediaReferences({ tenantId: "t1", purpose: "blog-image", urls: [url] });
    expect(refs.map((r) => (r.kind === "post" ? `post:${r.field}` : r.kind))).toEqual([
      "post:cover",
      "post:content",
      "post:content",
      "page",
    ]);
    const where = prisma.post.findMany.mock.calls[0]![0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.OR).toContainEqual({ bodyHtml: { contains: url } });
  });

  it("does not scan HTML bodies or pages for purposes outside the rich text editor", async () => {
    await findMediaReferences({ tenantId: "t1", purpose: "feed-image", urls: ["/api/media/x.png"] });
    const where = prisma.post.findMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).not.toContain("bodyHtml");
    expect(prisma.communityPage.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/media", () => {
  const key = "tenants/t1/blog-image/secret.png";
  const url = `/api/media/${key}`;
  const request = () => GET(new Request(`http://localhost${url}`), { params: Promise.resolve({ key: key.split("/") }) });

  const lockedPost = {
    visibility: "PUBLIC",
    priceCents: 990,
    entitlementKey: "post:p1",
    authorId: "author",
    isPublished: true,
    publishedAt: PAST,
    imageUrl: null,
    imageUrls: [],
    videoUrl: null,
    coverUrl: null,
    space: publicSpace,
  };

  let buyerKeys: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    buyerKeys = ["post:p1"];
    prisma.storageObject.findFirst.mockResolvedValue({
      id: "o1",
      tenantId: "t1",
      key,
      url,
      purpose: "blog-image",
      contentType: "image/png",
      visibility: "PUBLIC", // legacy row from before the MEMBERS default
      requiredEntitlementKey: null,
      tenant: { status: "ACTIVE" },
    });
    for (const model of [prisma.post, prisma.course, prisma.lesson, prisma.mediaItem, prisma.communityPage]) {
      model.findMany.mockResolvedValue([]);
    }
    prisma.post.findMany.mockResolvedValue([lockedPost]);
    prisma.membership.findUnique.mockResolvedValue({
      id: "m1",
      tenantId: "t1",
      userId: "buyer",
      role: "MEMBER",
      status: "ACTIVE",
      joinedAt: PAST,
    });
    prisma.entitlement.findMany.mockImplementation(async () => buyerKeys.map((k) => ({ key: k })));
    prisma.membershipTier.findFirst.mockResolvedValue(null);
    mocks.hasPlatformAdminAccess.mockReturnValue(false);
    mocks.getObject.mockResolvedValue({ body: "bytes", contentType: "image/png", contentLength: 5 });
  });

  it("refuses locked post media to visitors even though the row is PUBLIC", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await request();
    expect(res.status).toBe(403);
    expect(mocks.getObject).not.toHaveBeenCalled();
  });

  it("serves the buyer privately and stops after a refund revokes the entitlement", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "buyer" });
    const ok = await request();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(ok.headers.get("Vary")).toContain("Cookie");

    // The refund handler deletes the PURCHASE entitlement.
    buyerKeys = [];
    const after = await request();
    expect(after.status).toBe(403);
  });

  it("refuses paid-space media to a free member", async () => {
    prisma.post.findMany.mockResolvedValue([{ ...lockedPost, priceCents: 0, entitlementKey: null, space: vipSpace }]);
    mocks.getCurrentUser.mockResolvedValue({ id: "buyer" });
    buyerKeys = [];
    expect((await request()).status).toBe(403);
    buyerKeys = ["tier:vip"];
    prisma.membershipTier.findFirst.mockResolvedValue({ id: "tier1" });
    expect((await request()).status).toBe(200);
  });

  it("caches media publicly only when the content using it is public", async () => {
    prisma.post.findMany.mockResolvedValue([{ ...lockedPost, priceCents: 0, entitlementKey: null }]);
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/^public,/);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("treats an unreferenced legacy PUBLIC post image as members-only and private", async () => {
    prisma.post.findMany.mockResolvedValue([]);
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await request()).status).toBe(403);
    mocks.getCurrentUser.mockResolvedValue({ id: "buyer" });
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  });
});
