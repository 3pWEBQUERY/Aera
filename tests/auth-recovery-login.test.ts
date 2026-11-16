import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  setSessionCookie: vi.fn(),
  consume: vi.fn(),
  rateLimit: vi.fn(async () => true),
  compare: vi.fn(async () => true),
}));

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(), compare: mocks.compare } }));
vi.mock("@/lib/prisma", () => ({
  systemPrisma: { user: { findUnique: mocks.findUnique, update: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn(), setSessionCookie: mocks.setSessionCookie }));
vi.mock("@/lib/verification", () => ({ sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/secret-encryption", () => ({
  decryptSecret: (s: string) => s,
  encryptSecret: (s: string) => s,
  secretNeedsRotation: () => false,
}));
vi.mock("@/lib/totp-recovery", () => ({ consumeRecoveryCode: mocks.consume }));

import { authenticate } from "@/lib/auth";

const user = {
  id: "u1",
  email: "a@example.com",
  passwordHash: "hash",
  accountStatus: "ACTIVE",
  totpEnabledAt: new Date(),
  totpSecret: "JBSWY3DPEHPK3PXP",
  sessionVersion: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(user);
  mocks.compare.mockResolvedValue(true);
});

describe("login with a recovery code", () => {
  it("signs in and reports the recovery code use", async () => {
    mocks.consume.mockResolvedValue(true);
    const result = await authenticate("a@example.com", "pw", undefined, { recoveryCode: "abcd-efgh-jkmn" });
    expect(result).toMatchObject({ ok: true, usedRecoveryCode: true });
    expect(mocks.consume).toHaveBeenCalledWith("u1", "abcd-efgh-jkmn");
    expect(mocks.setSessionCookie).toHaveBeenCalled();
  });

  it("rejects a used or wrong code and keeps asking for the second factor", async () => {
    mocks.consume.mockResolvedValue(false);
    const result = await authenticate("a@example.com", "pw", undefined, { recoveryCode: "abcd-efgh-jkmn" });
    expect(result).toEqual({ ok: false, needsTotp: true, error: "recoveryCodeInvalid" });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it("never looks at recovery codes before the password is correct", async () => {
    mocks.compare.mockResolvedValue(false);
    const result = await authenticate("a@example.com", "wrong", undefined, { recoveryCode: "abcd-efgh-jkmn" });
    expect(result).toEqual({ ok: false, error: "invalidCredentials" });
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("still requires the second factor without any code", async () => {
    const result = await authenticate("a@example.com", "pw");
    expect(result).toEqual({ ok: false, needsTotp: true });
  });
});
