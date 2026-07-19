import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userCreate: vi.fn(),
  setSessionCookie: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "hashed-password"), compare: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  systemPrisma: { user: { create: mocks.userCreate } },
}));
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
  setSessionCookie: mocks.setSessionCookie,
}));
vi.mock("@/lib/verification", () => ({
  sendVerificationEmail: mocks.sendVerificationEmail,
}));

import { registerUser } from "@/lib/auth";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_DOCUMENT,
} from "@/lib/legal";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userCreate.mockResolvedValue({
    id: "u1",
    email: "member@example.com",
    name: "Member",
    passwordHash: "hashed-password",
    avatarUrl: null,
    emailVerifiedAt: null,
    totpSecret: null,
    totpEnabledAt: null,
    sessionVersion: 0,
    platformRole: "USER",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe("registration legal evidence", () => {
  it("persists versioned terms acceptance and privacy acknowledgement atomically", async () => {
    await expect(
      registerUser({
        name: " Member ",
        email: " MEMBER@EXAMPLE.COM ",
        password: "password123",
        legalAcceptanceSource: "WEB_SIGNUP",
      }),
    ).resolves.toMatchObject({ ok: true, user: { id: "u1" } });

    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "member@example.com",
        name: "Member",
        passwordHash: "hashed-password",
        legalAcceptances: {
          create: [
            {
              document: LEGAL_DOCUMENT.terms,
              version: CURRENT_TERMS_VERSION,
              source: "WEB_SIGNUP",
            },
            {
              document: LEGAL_DOCUMENT.privacyNotice,
              version: CURRENT_PRIVACY_VERSION,
              source: "WEB_SIGNUP",
            },
          ],
        },
      }),
    });
    expect(mocks.setSessionCookie).toHaveBeenCalledWith({
      userId: "u1",
      sessionVersion: 0,
    });
  });
});
