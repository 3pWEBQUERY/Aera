import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma, systemPrisma: prisma };
});

import prismaModule from "@/lib/prisma";
import { signAccountToken, verifyAccountToken } from "@/lib/tokens";

const prisma = prismaModule as unknown as PrismaMock;

const user = {
  id: "u1",
  email: "old@example.com",
  passwordHash: "hash-1",
  accountStatus: "ACTIVE",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("account tokens", () => {
  it("verifies a fresh token for the same purpose", async () => {
    const token = await signAccountToken(user, "verify", "1h");
    prisma.user.findUnique.mockResolvedValue(user);
    await expect(verifyAccountToken(token, "verify")).resolves.toMatchObject({ id: "u1" });
    await expect(verifyAccountToken(token, "reset")).resolves.toBeNull();
  });

  it("rejects a verify link sent to the old address after an e-mail change", async () => {
    const token = await signAccountToken(user, "verify", "1h");
    prisma.user.findUnique.mockResolvedValue({ ...user, email: "new@example.com" });
    await expect(verifyAccountToken(token, "verify")).resolves.toBeNull();
  });

  it("rejects reset and invite links after an e-mail change too", async () => {
    for (const purpose of ["reset", "invite"] as const) {
      const token = await signAccountToken(user, purpose, "1h");
      prisma.user.findUnique.mockResolvedValue({ ...user, email: "new@example.com" });
      await expect(verifyAccountToken(token, purpose)).resolves.toBeNull();
    }
  });

  it("stays single-use: a new password invalidates the link", async () => {
    const token = await signAccountToken(user, "reset", "1h");
    prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: "hash-2" });
    await expect(verifyAccountToken(token, "reset")).resolves.toBeNull();
  });

  it("ignores case and surrounding whitespace of the stored address", async () => {
    const token = await signAccountToken(user, "verify", "1h");
    prisma.user.findUnique.mockResolvedValue({ ...user, email: " Old@Example.com " });
    await expect(verifyAccountToken(token, "verify")).resolves.toMatchObject({ id: "u1" });
  });
});
