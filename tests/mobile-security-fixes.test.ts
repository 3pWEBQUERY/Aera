import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  requireMobileAuth: vi.fn(),
  resolveTenant: vi.fn(),
  requireStudioAccess: vi.fn(),
  cancelImmediately: vi.fn(),
  writeAudit: vi.fn(),
  awardPoints: vi.fn(),
  rateLimit: vi.fn(),
  buildViewerContext: vi.fn(),
  postDtos: vi.fn(),
}));

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
    withTenantTransaction: (fn: (tx: unknown) => unknown) => fn(prisma),
  };
});
vi.mock("@/lib/mobile/api", async () => {
  const { NextResponse } = await import("next/server");
  const jsonError = (code: string, message: string, status: number) =>
    NextResponse.json({ error: { code, message } }, { status });
  return {
    jsonError,
    jsonOk: (data: unknown) => NextResponse.json(data),
    requireMobileAuth: mocks.requireMobileAuth,
    resolveTenant: mocks.resolveTenant,
    parseJsonBody: async (req: Request, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) => {
      const parsed = schema.safeParse(await req.json());
      return parsed.success
        ? { data: parsed.data }
        : { response: jsonError("validation", "invalid", 400) };
    },
  };
});
vi.mock("@/lib/mobile/studio", () => ({
  requireStudioAccess: mocks.requireStudioAccess,
  studioMemberDtos: vi.fn(async (_t: string, rows: unknown[]) => rows),
  STUDIO_MEMBER_INCLUDE: {},
}));
vi.mock("@/lib/mobile/serializers", () => ({
  buildViewerContext: mocks.buildViewerContext,
  postDtos: mocks.postDtos,
  courseDtos: vi.fn(async () => []),
  eventDtos: vi.fn(async () => []),
  productDtos: vi.fn(async () => []),
  singleCommentDto: vi.fn(async () => ({ id: "c1" })),
  POST_INCLUDE: {},
}));
vi.mock("@/lib/stripe-cleanup", () => ({
  cancelStripeSubscriptionsImmediately: mocks.cancelImmediately,
}));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/gamification", () => ({ awardPoints: mocks.awardPoints }));
vi.mock("@/lib/moderation", () => ({ moderateContent: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import prismaModule from "@/lib/prisma";
import { POST as postComment } from "@/app/api/mobile/v1/c/[slug]/comments/route";
import { POST as rsvp } from "@/app/api/mobile/v1/c/[slug]/events/[eventId]/rsvp/route";
import { POST as completeLesson } from "@/app/api/mobile/v1/c/[slug]/lessons/[lessonId]/complete/route";
import { POST as updateMember } from "@/app/api/mobile/v1/studio/[slug]/members/[userId]/route";
import { GET as search } from "@/app/api/mobile/v1/c/[slug]/search/route";

const prisma = prismaModule as unknown as PrismaMock;

const user = { id: "u1", name: "Mia" };
const publicSpace = { id: "s1", slug: "feed", type: "FEED", visibility: "PUBLIC", requiredEntitlementKey: null };

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function activeMember(keys: string[] = []) {
  prisma.membership.findUnique.mockResolvedValue({
    id: "m1",
    tenantId: "t1",
    userId: "u1",
    role: "MEMBER",
    status: "ACTIVE",
    tierId: null,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
  });
  prisma.entitlement.findMany.mockResolvedValue(keys.map((key) => ({ key })));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMobileAuth.mockResolvedValue({ user });
  mocks.resolveTenant.mockResolvedValue({ id: "t1", slug: "demo" });
  mocks.rateLimit.mockResolvedValue(true);
  mocks.cancelImmediately.mockResolvedValue(undefined);
  prisma.membershipTier.findFirst.mockResolvedValue(null);
  prisma.subscription.findMany.mockResolvedValue([]);
  prisma.eventRsvp.findUnique.mockResolvedValue(null);
  prisma.eventRsvp.count.mockResolvedValue(0);
  activeMember();
});

describe("mobile comments", () => {
  it("rejects comments on a post with closed comments", async () => {
    prisma.post.findFirst.mockResolvedValue({ id: "p1", spaceId: "s1", authorId: "a", closeComments: true });
    prisma.space.findFirst.mockResolvedValue(publicSpace);

    const res = await postComment(jsonRequest({ postId: "p1", body: "Hallo" }), {
      params: Promise.resolve({ slug: "demo" }),
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("comments_closed");
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });
});

describe("mobile RSVP and lesson completion", () => {
  it("rejects an RSVP to a gated event without the entitlement", async () => {
    prisma.event.findFirst.mockResolvedValue({
      id: "e1",
      requiredEntitlementKey: "tier:vip",
      space: publicSpace,
    });

    const res = await rsvp(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ slug: "demo", eventId: "e1" }),
    });

    expect(res.status).toBe(403);
    expect(prisma.eventRsvp.create).not.toHaveBeenCalled();
    expect(mocks.awardPoints).not.toHaveBeenCalled();
  });

  it("rejects completing a lesson of a paid course without access", async () => {
    prisma.lesson.findFirst.mockResolvedValue({
      id: "l1",
      courseId: "co1",
      isPreview: false,
      dripAfterDays: null,
      course: { isPublished: true, requiredEntitlementKey: "product:kurs", space: publicSpace },
    });

    const res = await completeLesson(new Request("http://localhost/api", { method: "POST" }), {
      params: Promise.resolve({ slug: "demo", lessonId: "l1" }),
    });

    expect(res.status).toBe(403);
    expect(prisma.lessonProgress.create).not.toHaveBeenCalled();
  });
});

describe("mobile studio ban", () => {
  beforeEach(() => {
    mocks.requireStudioAccess.mockResolvedValue({
      tenant: { id: "t1", slug: "demo" },
      user: { id: "owner" },
      role: "OWNER",
    });
    prisma.membership.findUnique.mockResolvedValue({
      id: "m2",
      tenantId: "t1",
      userId: "member",
      role: "MEMBER",
      status: "ACTIVE",
      tierId: "tier_paid",
    });
    prisma.membership.update.mockResolvedValue({ id: "m2", status: "BANNED" });
    prisma.membershipTier.findFirst.mockResolvedValue({ entitlementKey: "tier:paid" });
    prisma.subscription.findMany.mockResolvedValue([{ stripeSubscriptionId: "sub_live" }]);
  });

  function ban() {
    return updateMember(jsonRequest({ action: "ban" }), {
      params: Promise.resolve({ slug: "demo", userId: "member" }),
    });
  }

  it("cancels Stripe, ends local subscriptions and revokes tier access like the web", async () => {
    const res = await ban();

    expect(res.status).toBe(200);
    expect(mocks.cancelImmediately).toHaveBeenCalledWith(["sub_live"]);
    expect(mocks.cancelImmediately.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.membership.update.mock.invocationCallOrder[0],
    );
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", userId: "member", status: { not: "CANCELED" } },
      data: { status: "CANCELED", cancelAtPeriodEnd: false },
    });
    expect(prisma.entitlement.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", userId: "member", key: "tier:paid" },
    });
  });

  it("changes nothing when Stripe cannot cancel", async () => {
    mocks.cancelImmediately.mockRejectedValue(new Error("Stripe down"));

    const res = await ban();

    expect(res.status).toBe(502);
    expect(prisma.membership.update).not.toHaveBeenCalled();
    expect(prisma.entitlement.deleteMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "member.update.blocked" }),
    );
  });

  it("does not touch billing when unbanning", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "m2",
      tenantId: "t1",
      userId: "member",
      role: "MEMBER",
      status: "BANNED",
      tierId: "tier_paid",
    });

    const res = await updateMember(jsonRequest({ action: "unban" }), {
      params: Promise.resolve({ slug: "demo", userId: "member" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.cancelImmediately).not.toHaveBeenCalled();
    expect(prisma.entitlement.deleteMany).not.toHaveBeenCalled();
  });
});

describe("mobile search", () => {
  beforeEach(() => {
    mocks.buildViewerContext.mockResolvedValue({
      ctx: {
        userId: "u1",
        membership: { status: "ACTIVE" },
        role: "MEMBER",
        keys: new Set<string>(),
        isStaff: false,
        hasPaidEntitlement: false,
      },
    });
    prisma.space.findMany.mockResolvedValue([publicSpace]);
    prisma.post.findMany.mockResolvedValue([]);
    prisma.knowledgeArticle.findMany.mockResolvedValue([]);
  });

  function get(q: string) {
    return search(new Request(`http://localhost/api?q=${encodeURIComponent(q)}`), {
      params: Promise.resolve({ slug: "demo" }),
    });
  }

  it("only matches the body of posts the viewer may open", async () => {
    const res = await get("geheim");

    expect(res.status).toBe(200);
    const where = prisma.post.findMany.mock.calls[0][0].where;
    expect(where.OR[0]).toEqual({ title: { contains: "geheim", mode: "insensitive" } });
    expect(where.OR[1].AND[0]).toEqual({ body: { contains: "geheim", mode: "insensitive" } });
    // Kein Schluessel, kein bezahlter Zugang: nur freie PUBLIC/MEMBERS-Beitraege.
    expect(where.OR[1].AND[1]).toEqual({
      OR: [{ priceCents: { lte: 0 }, visibility: { in: ["PUBLIC", "MEMBERS"] } }],
    });
  });

  it("is rate limited per user", async () => {
    mocks.rateLimit.mockResolvedValue(false);

    const res = await get("geheim");

    expect(res.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith("msearch:u1", 60, 60_000);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });
});
