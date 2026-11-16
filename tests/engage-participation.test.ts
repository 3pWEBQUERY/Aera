import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  awardPoints: vi.fn(),
  notify: vi.fn(),
  moderateContent: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
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
vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  registerUser: vi.fn(),
}));
vi.mock("@/lib/gamification", () => ({ awardPoints: mocks.awardPoints }));
vi.mock("@/lib/notifications", () => ({ notify: mocks.notify }));
vi.mock("@/lib/moderation", () => ({ moderateContent: mocks.moderateContent }));
vi.mock("@/lib/webhooks", () => ({ emitWebhookEvent: vi.fn() }));
vi.mock("@/lib/ai", () => ({ indexContent: vi.fn() }));
vi.mock("@/lib/stripe", () => ({}));
vi.mock("@/lib/product-inventory", () => ({}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => true), clientIp: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/action-errors", () => ({
  getErrorTranslator: vi.fn(async () => (key: string) => key),
  zodError: vi.fn(() => "invalidInput"),
}));

import prismaModule from "@/lib/prisma";
import {
  completeLessonAction,
  createCommentAction,
  rsvpEventAction,
} from "@/app/actions/engage";
import { canCompleteLesson, canRsvpEvent } from "@/lib/participation";
import type { AccessContext } from "@/lib/entitlements";

const prisma = prismaModule as unknown as PrismaMock;

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

const publicSpace = { id: "s1", slug: "feed", visibility: "PUBLIC", requiredEntitlementKey: null };
const membersSpace = { id: "s2", slug: "kurs", visibility: "MEMBERS", requiredEntitlementKey: null };

function membership(status: "ACTIVE" | "BANNED" | "PENDING", role = "MEMBER") {
  return {
    id: "m1",
    tenantId: "t1",
    userId: "u1",
    role,
    status,
    tierId: null,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function asMember(status: "ACTIVE" | "BANNED" | "PENDING" | null, keys: string[] = []) {
  prisma.membership.findUnique.mockResolvedValue(status ? membership(status) : null);
  prisma.entitlement.findMany.mockResolvedValue(keys.map((key) => ({ key })));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", name: "Mia", email: "mia@example.com" });
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
  prisma.tenant.findUnique.mockResolvedValue({ id: "t1", slug: "demo", status: "ACTIVE" });
  prisma.membershipTier.findFirst.mockResolvedValue(null);
  prisma.eventRsvp.findUnique.mockResolvedValue(null);
  asMember("ACTIVE");
});

describe("createCommentAction — closed comments", () => {
  beforeEach(() => {
    prisma.space.findFirst.mockResolvedValue(publicSpace);
    prisma.comment.create.mockResolvedValue({ id: "c1" });
  });

  it("rejects a comment on a post with closed comments", async () => {
    prisma.post.findFirst.mockResolvedValue({
      id: "p1",
      spaceId: "s1",
      authorId: "author",
      closeComments: true,
    });

    const result = await createCommentAction({}, form({ tenant: "demo", postId: "p1", body: "Hallo" }));

    expect(result).toEqual({ error: "commentsClosed" });
    expect(prisma.comment.create).not.toHaveBeenCalled();
    expect(mocks.awardPoints).not.toHaveBeenCalled();
  });

  it("applies to staff as well (the UI offers no form either)", async () => {
    prisma.membership.findUnique.mockResolvedValue(membership("ACTIVE", "ADMIN"));
    prisma.post.findFirst.mockResolvedValue({
      id: "p1",
      spaceId: "s1",
      authorId: "author",
      closeComments: true,
    });

    const result = await createCommentAction({}, form({ tenant: "demo", postId: "p1", body: "Hallo" }));

    expect(result).toEqual({ error: "commentsClosed" });
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it("still accepts comments on open posts", async () => {
    prisma.post.findFirst.mockResolvedValue({
      id: "p1",
      spaceId: "s1",
      authorId: "author",
      closeComments: false,
    });

    const result = await createCommentAction({}, form({ tenant: "demo", postId: "p1", body: "Hallo" }));

    expect(result).toEqual({ ok: true });
    expect(prisma.comment.create).toHaveBeenCalled();
  });
});

describe("rsvpEventAction", () => {
  function event(overrides: Record<string, unknown> = {}) {
    return { id: "e1", tenantId: "t1", requiredEntitlementKey: null, space: publicSpace, ...overrides };
  }

  it("does not let a non-member RSVP to an event in a public space", async () => {
    asMember(null);
    prisma.event.findFirst.mockResolvedValue(event());

    await rsvpEventAction(form({ tenant: "demo", eventId: "e1" }));

    expect(prisma.eventRsvp.create).not.toHaveBeenCalled();
    expect(mocks.awardPoints).not.toHaveBeenCalled();
  });

  it("does not let a banned member RSVP", async () => {
    asMember("BANNED");
    prisma.event.findFirst.mockResolvedValue(event());

    await rsvpEventAction(form({ tenant: "demo", eventId: "e1" }));

    expect(prisma.eventRsvp.create).not.toHaveBeenCalled();
  });

  it("requires the event's entitlement key", async () => {
    asMember("ACTIVE");
    prisma.event.findFirst.mockResolvedValue(event({ requiredEntitlementKey: "tier:vip" }));

    await rsvpEventAction(form({ tenant: "demo", eventId: "e1" }));

    expect(prisma.eventRsvp.create).not.toHaveBeenCalled();
  });

  it("lets an entitled active member RSVP and awards points", async () => {
    asMember("ACTIVE", ["tier:vip"]);
    prisma.event.findFirst.mockResolvedValue(event({ requiredEntitlementKey: "tier:vip" }));

    await rsvpEventAction(form({ tenant: "demo", eventId: "e1" }));

    expect(prisma.eventRsvp.create).toHaveBeenCalled();
    expect(mocks.awardPoints).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "EVENT_RSVP", refId: "e1" }),
    );
  });

  it("always allows withdrawing an existing RSVP", async () => {
    asMember("BANNED");
    prisma.event.findFirst.mockResolvedValue(event({ requiredEntitlementKey: "tier:vip" }));
    prisma.eventRsvp.findUnique.mockResolvedValue({ id: "r1" });

    await rsvpEventAction(form({ tenant: "demo", eventId: "e1" }));

    expect(prisma.eventRsvp.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
    expect(prisma.eventRsvp.create).not.toHaveBeenCalled();
  });
});

describe("completeLessonAction", () => {
  function lesson(overrides: Record<string, unknown> = {}, course: Record<string, unknown> = {}) {
    return {
      id: "l1",
      tenantId: "t1",
      courseId: "co1",
      isPreview: false,
      dripAfterDays: null,
      course: {
        isPublished: true,
        requiredEntitlementKey: null,
        space: membersSpace,
        ...course,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma.lessonProgress.findUnique.mockResolvedValue(null);
  });

  it("does not let a free member farm points on a paid course", async () => {
    asMember("ACTIVE");
    prisma.lesson.findFirst.mockResolvedValue(lesson({}, { requiredEntitlementKey: "product:kurs" }));

    await completeLessonAction(form({ tenant: "demo", lessonId: "l1" }));

    expect(prisma.lessonProgress.create).not.toHaveBeenCalled();
    expect(mocks.awardPoints).not.toHaveBeenCalled();
  });

  it("allows a preview lesson of a paid course", async () => {
    asMember("ACTIVE");
    prisma.lesson.findFirst.mockResolvedValue(
      lesson({ isPreview: true }, { requiredEntitlementKey: "product:kurs" }),
    );

    await completeLessonAction(form({ tenant: "demo", lessonId: "l1" }));

    expect(prisma.lessonProgress.create).toHaveBeenCalled();
  });

  it("requires access to the course's space and an active membership", async () => {
    asMember(null);
    prisma.lesson.findFirst.mockResolvedValue(lesson());

    await completeLessonAction(form({ tenant: "demo", lessonId: "l1" }));

    expect(prisma.lessonProgress.create).not.toHaveBeenCalled();
  });

  it("records progress for an entitled member", async () => {
    asMember("ACTIVE", ["product:kurs"]);
    prisma.lesson.findFirst.mockResolvedValue(lesson({}, { requiredEntitlementKey: "product:kurs" }));

    await completeLessonAction(form({ tenant: "demo", lessonId: "l1" }));

    expect(prisma.lessonProgress.create).toHaveBeenCalled();
    expect(mocks.awardPoints).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "LESSON_COMPLETED", refId: "l1" }),
    );
  });
});

describe("lib/participation", () => {
  function ctx(overrides: Partial<AccessContext> = {}): AccessContext {
    return {
      userId: "u1",
      membership: membership("ACTIVE") as AccessContext["membership"],
      role: "MEMBER",
      keys: new Set<string>(),
      isStaff: false,
      hasPaidEntitlement: false,
      ...overrides,
    };
  }
  const paidSpace = { visibility: "PAID" as const, requiredEntitlementKey: null };

  it("respects the space paywall for events", () => {
    expect(canRsvpEvent({ requiredEntitlementKey: null, space: paidSpace }, ctx())).toBe(false);
    expect(
      canRsvpEvent({ requiredEntitlementKey: null, space: paidSpace }, ctx({ hasPaidEntitlement: true })),
    ).toBe(true);
  });

  it("keeps drip and unpublished courses closed for members but not for staff", () => {
    const base = {
      isPreview: false,
      dripAfterDays: 100_000,
      course: { isPublished: true, requiredEntitlementKey: null, space: paidSpace },
    };
    expect(canCompleteLesson(base, ctx({ hasPaidEntitlement: true }))).toBe(false);
    expect(
      canCompleteLesson(
        { ...base, dripAfterDays: null, course: { ...base.course, isPublished: false } },
        ctx({ hasPaidEntitlement: true }),
      ),
    ).toBe(false);
    expect(
      canCompleteLesson(base, ctx({ isStaff: true, role: "MODERATOR" })),
    ).toBe(true);
  });
});
