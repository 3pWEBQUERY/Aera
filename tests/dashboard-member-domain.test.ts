import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  requireTenantAdmin: vi.fn(),
  cancelImmediately: vi.fn(),
  writeAudit: vi.fn(),
  checkDomainDns: vi.fn(),
  tErr: vi.fn(async (key: string) => key),
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
vi.mock("@/lib/guards", () => ({
  requireTenantAdmin: mocks.requireTenantAdmin,
  requirePlatformAdmin: vi.fn(),
}));
vi.mock("@/lib/stripe-cleanup", () => ({
  assertStripeSubscriptionsInactive: vi.fn(),
  cancelStripeSubscriptionsImmediately: mocks.cancelImmediately,
  deleteStripeConnectAccount: vi.fn(),
  StripeSubscriptionStillActiveError: class extends Error {},
}));
vi.mock("@/lib/plan", () => ({
  checkStaffLimit: vi.fn(async () => ({ allowed: true })),
  checkMemberLimit: vi.fn(async () => ({ allowed: true })),
  featureBlocked: vi.fn(async () => null),
}));
vi.mock("@/lib/domains", () => ({
  checkDomainDns: mocks.checkDomainDns,
  txtVerificationValue: (tenantId: string) => `aera-verify=${tenantId}`,
}));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://aera.test", AUTH_SECRET: "vitest-secret-0123456789-0123456789-0123456789" },
  features: { email: false },
}));
vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn(async () => "hashed"),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/creator-checkout", () => ({ countOpenCreatorCheckouts: vi.fn(async () => 0) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/action-errors", () => ({
  tErr: mocks.tErr,
  zodErr: vi.fn(async () => "invalidData"),
}));

import prismaModule from "@/lib/prisma";
import {
  createMemberAction,
  updateMemberAction,
  verifyCustomDomainAction,
} from "@/app/actions/dashboard";
import { sanitizeAvatarUrl } from "@/lib/avatar-url";

const prisma = prismaModule as unknown as PrismaMock;

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

const tenant = {
  id: "t1",
  slug: "demo",
  name: "Demo",
  customDomain: "community.example.com",
  customDomainVerifiedAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTenantAdmin.mockResolvedValue({ tenant, user: { id: "owner" }, role: "OWNER" });
  mocks.cancelImmediately.mockResolvedValue(undefined);
  prisma.subscription.findMany.mockResolvedValue([]);
});

describe("sanitizeAvatarUrl", () => {
  it("keeps http(s) URLs and own upload paths", () => {
    expect(sanitizeAvatarUrl("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(sanitizeAvatarUrl("/api/media/t1/avatar.png")).toBe("/api/media/t1/avatar.png");
    expect(sanitizeAvatarUrl("/uploads/a.png")).toBe("/uploads/a.png");
  });

  it("drops everything else", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "//evil.example/a.png",
      "/\\evil.example/a.png",
      "/api/media/../admin",
      "/dashboard/evil",
      "",
    ]) {
      expect(sanitizeAvatarUrl(bad)).toBeNull();
    }
  });
});

describe("member avatars", () => {
  it("never overwrites another user's global avatar from the member editor", async () => {
    prisma.membership.findFirst.mockResolvedValue({
      id: "m1",
      tenantId: "t1",
      userId: "member",
      role: "MEMBER",
      tierId: null,
    });

    const result = await updateMemberAction(
      {},
      form({
        tenant: "demo",
        membershipId: "m1",
        role: "MEMBER",
        status: "ACTIVE",
        avatarUrl: "https://evil.example/face.png",
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("validates the avatar of a newly created shadow account", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "new", email: "neu@example.com", passwordHash: "hashed" });
    prisma.membership.findUnique.mockResolvedValue(null);
    prisma.membershipTier.findFirst.mockResolvedValue(null);

    await createMemberAction(
      {},
      form({ tenant: "demo", email: "neu@example.com", role: "MEMBER", avatarUrl: "javascript:alert(1)" }),
    );

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "neu@example.com", avatarUrl: null }),
    });
  });

  it("does not touch an existing account's avatar when adding it as member", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "existing", email: "da@example.com", passwordHash: "x" });
    prisma.membership.findUnique.mockResolvedValue(null);
    prisma.membershipTier.findFirst.mockResolvedValue(null);

    await createMemberAction(
      {},
      form({ tenant: "demo", email: "da@example.com", role: "MEMBER", avatarUrl: "https://evil.example/x.png" }),
    );

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("verifyCustomDomainAction", () => {
  it("clears an earlier verification when the TXT proof is gone", async () => {
    mocks.checkDomainDns.mockResolvedValue({ verified: false, reason: "txt_missing" });

    const result = await verifyCustomDomainAction({}, form({ tenant: "demo" }));

    expect(result).toEqual({ error: "domainTxtMissing" });
    expect(mocks.tErr).toHaveBeenCalledWith("domainTxtMissing", {
      domain: "community.example.com",
      value: "aera-verify=t1",
    });
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { customDomainVerifiedAt: null },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant.domain.unverified" }),
    );
  });

  it("reports a foreign TXT value as mismatch", async () => {
    mocks.checkDomainDns.mockResolvedValue({ verified: false, reason: "txt_mismatch" });
    mocks.requireTenantAdmin.mockResolvedValue({
      tenant: { ...tenant, customDomainVerifiedAt: null },
      user: { id: "owner" },
      role: "OWNER",
    });

    const result = await verifyCustomDomainAction({}, form({ tenant: "demo" }));

    expect(result).toEqual({ error: "domainTxtMismatch" });
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("marks the domain verified with the TXT proof", async () => {
    mocks.checkDomainDns.mockResolvedValue({ verified: true, reason: "verified" });

    const result = await verifyCustomDomainAction({}, form({ tenant: "demo" }));

    expect(result).toEqual({ ok: true });
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { customDomainVerifiedAt: expect.any(Date) },
    });
  });
});
