import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma };
});

import prismaModule from "@/lib/prisma";
const prisma = prismaModule as unknown as PrismaMock;

import { searchCommunity } from "@/lib/search";
import type { AccessContext } from "@/lib/entitlements";

function ctx(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: "u1",
    membership: { status: "ACTIVE" } as AccessContext["membership"],
    role: "MEMBER",
    keys: new Set<string>(),
    isStaff: false,
    hasPaidEntitlement: false,
    ...overrides,
  };
}

const openSpace = { slug: "feed", name: "Feed", visibility: "MEMBERS", requiredEntitlementKey: null };
const paidSpace = { slug: "vip", name: "VIP", visibility: "PAID", requiredEntitlementKey: null };

function mockEmpty() {
  prisma.post.findMany.mockResolvedValue([]);
  prisma.course.findMany.mockResolvedValue([]);
  prisma.knowledgeArticle.findMany.mockResolvedValue([]);
  prisma.event.findMany.mockResolvedValue([]);
  prisma.product.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEmpty();
});

describe("searchCommunity", () => {
  it("returns nothing for queries shorter than 2 characters", async () => {
    expect(await searchCommunity("t1", "demo", ctx(), "a")).toEqual([]);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it("finds posts in accessible spaces and builds excerpts", async () => {
    prisma.post.findMany.mockResolvedValue([
      { id: "p1", title: "Yoga Basics", body: "Alles über Yoga für Anfänger.", space: openSpace },
    ]);

    const results = await searchCommunity("t1", "demo", ctx(), "yoga");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "post",
      title: "Yoga Basics",
      href: "/c/demo/s/feed/p1",
      locked: false,
    });
    expect(results[0]!.excerpt).toContain("Yoga");
  });

  it("hides posts from spaces the user cannot access", async () => {
    prisma.post.findMany.mockResolvedValue([
      { id: "p1", title: "Geheim", body: "VIP-Inhalt", space: paidSpace },
    ]);

    const results = await searchCommunity("t1", "demo", ctx(), "geheim");
    expect(results).toHaveLength(0);
  });

  it("staff see everything", async () => {
    prisma.post.findMany.mockResolvedValue([
      { id: "p1", title: "Geheim", body: "VIP-Inhalt", space: paidSpace },
    ]);

    const results = await searchCommunity("t1", "demo", ctx({ isStaff: true }), "geheim");
    expect(results).toHaveLength(1);
  });

  it("marks entitlement-gated courses as locked without leaking the excerpt", async () => {
    prisma.course.findMany.mockResolvedValue([
      {
        id: "c1",
        title: "Masterclass",
        description: "Exklusiver Kursinhalt",
        requiredEntitlementKey: "tier:vip",
        space: openSpace,
      },
    ]);

    const results = await searchCommunity("t1", "demo", ctx(), "masterclass");
    expect(results[0]).toMatchObject({ type: "course", locked: true, excerpt: null });

    const unlocked = await searchCommunity(
      "t1",
      "demo",
      ctx({ keys: new Set(["tier:vip"]) }),
      "masterclass",
    );
    expect(unlocked[0]).toMatchObject({ locked: false });
    expect(unlocked[0]!.excerpt).toContain("Exklusiver");
  });

  it("strips HTML from excerpts", async () => {
    prisma.knowledgeArticle.findMany.mockResolvedValue([
      {
        id: "k1",
        title: "FAQ",
        body: "<p>Antwort auf <strong>alles</strong> Wichtige</p>",
        space: openSpace,
      },
    ]);

    const results = await searchCommunity("t1", "demo", ctx(), "antwort");
    expect(results[0]!.excerpt).not.toContain("<");
    expect(results[0]!.excerpt).toContain("Antwort auf alles");
  });
});
