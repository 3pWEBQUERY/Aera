import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTenantAdmin: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/guards", () => ({
  requireTenantAdmin: mocks.requireTenantAdmin,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://aera.test", STRIPE_SECRET_KEY: "" },
}));
vi.mock("@/lib/stripe", () => ({
  createConnectAccount: vi.fn(),
  createOnboardingLink: vi.fn(),
}));
vi.mock("@/lib/stripe-cleanup", () => ({
  assertStripeSubscriptionsInactive: vi.fn(),
  deleteStripeConnectAccount: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/api-keys", () => ({
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));
vi.mock("@/lib/webhooks", () => ({
  generateWebhookSecret: vi.fn(),
  WEBHOOK_EVENTS: [],
}));
vi.mock("@/lib/webhook-url", () => ({ validateWebhookUrl: vi.fn() }));
// Package gating is covered in tests/plan-gating.test.ts; here every action is
// assumed to be inside the tenant's package so the role checks stay isolated.
vi.mock("@/lib/plan", () => ({
  featureBlocked: vi.fn(async () => null),
  tenantHasFeature: vi.fn(async () => true),
}));
vi.mock("@/lib/secret-encryption", () => ({ encryptSecret: vi.fn() }));
vi.mock("@/lib/action-errors", () => ({
  tErr: vi.fn(async (key: string) => key),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import { disconnectStripeAction } from "@/app/actions/stripe-connect";
import { createApiKeyAction } from "@/app/actions/developers";
import { testStripeAction } from "@/app/actions/integration-test";

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTenantAdmin.mockResolvedValue({
    tenant: { id: "t1", slug: "demo", stripeAccountId: null },
    user: { id: "owner" },
    role: "OWNER",
  });
});

describe("owner-only sensitive tenant capabilities", () => {
  it("requires OWNER before Stripe Connect can be disconnected", async () => {
    await disconnectStripeAction(form({ tenant: "demo" }));
    expect(mocks.requireTenantAdmin).toHaveBeenCalledWith("demo", "OWNER");
  });

  it("requires OWNER before API keys can be created", async () => {
    await expect(
      createApiKeyAction({}, form({ tenant: "demo", name: "x" })),
    ).resolves.toEqual({ error: "keyName" });
    expect(mocks.requireTenantAdmin).toHaveBeenCalledWith("demo", "OWNER");
  });

  it("requires OWNER before probing the platform Stripe credential", async () => {
    await testStripeAction({}, form({ tenant: "demo" }));
    expect(mocks.requireTenantAdmin).toHaveBeenCalledWith("demo", "OWNER");
  });
});
