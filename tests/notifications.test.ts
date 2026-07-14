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

import { notify, markAllNotificationsRead } from "@/lib/notifications";

const base = {
  tenantId: "t1",
  userId: "author1",
  actorId: "commenter1",
  type: "POST_COMMENT" as const,
  message: "X hat deinen Beitrag kommentiert.",
  href: "/c/demo/s/feed/p1",
  refType: "Comment",
  refId: "c1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notify", () => {
  it("creates a notification for the recipient", async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await notify(base);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          userId: "author1",
          actorId: "commenter1",
          type: "POST_COMMENT",
        }),
      }),
    );
  });

  it("never notifies users about their own actions", async () => {
    await notify({ ...base, userId: "same", actorId: "same" });
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("dedupes identical notifications (same actor, type and ref)", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "existing" });
    await notify(base);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("is best-effort: a failing insert never throws into the caller", async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    prisma.notification.create.mockRejectedValue(new Error("db down"));
    await expect(notify(base)).resolves.toBeUndefined();
  });
});

describe("markAllNotificationsRead", () => {
  it("only touches unread rows of this tenant + user", async () => {
    await markAllNotificationsRead("t1", "u1");
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", userId: "u1", readAt: null },
        data: { readAt: expect.any(Date) },
      }),
    );
  });
});
