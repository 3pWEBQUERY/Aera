import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
  nameStatus: vi.fn(),
  grantEntitlement: vi.fn(),
  writeAudit: vi.fn(),
  getOrCreateWallet: vi.fn(),
  startTrackedCreatorPlanCheckout: vi.fn(),
  features: { creatorBilling: false },
}));

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma };
});
vi.mock("@/lib/guards", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/tenant-name", () => ({ nameStatus: mocks.nameStatus }));
vi.mock("@/lib/entitlements", () => ({ grantEntitlement: mocks.grantEntitlement }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/credits", () => ({ getOrCreateWallet: mocks.getOrCreateWallet }));
vi.mock("@/lib/creator-checkout", () => ({
  startTrackedCreatorPlanCheckout: mocks.startTrackedCreatorPlanCheckout,
}));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://aera.test" },
  features: mocks.features,
}));
vi.mock("@/lib/action-errors", () => ({
  getErrorTranslator: vi.fn(async () => (key: string) => key),
  zodError: vi.fn((_t, result) => result.error.issues[0]?.message ?? "invalidInput"),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) =>
    (key: string) => `${namespace}.${key}`,
  ),
}));

import prismaModule from "@/lib/prisma";
import { createCommunityAction } from "@/app/actions/community";

const prisma = prismaModule as unknown as PrismaMock;

function form(plan: string): FormData {
  const fd = new FormData();
  fd.set("creatorPlan", plan);
  fd.set("name", "Demo Studio");
  fd.set("slug", "demo-studio");
  fd.set("tagline", "A demo community");
  fd.set("description", "Description");
  fd.set("primaryColor", "#6d28d9");
  fd.set("accentColor", "#ec4899");
  fd.set("visibility", "PUBLIC");
  fd.set("membershipName", "Members");
  fd.set("spaces", JSON.stringify(["FEED"]));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.features.creatorBilling = false;
  mocks.requireUser.mockResolvedValue({
    id: "u1",
    name: "Owner",
    email: "owner@example.com",
  });
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
  mocks.nameStatus.mockResolvedValue("available");
  prisma.tenant.findUnique.mockResolvedValue(null);
  prisma.tenant.create.mockResolvedValue({
    id: "t1",
    name: "Demo Studio",
    slug: "demo-studio",
  });
  mocks.getOrCreateWallet.mockResolvedValue({ stripeCustomerId: null });
  mocks.startTrackedCreatorPlanCheckout.mockResolvedValue("https://checkout.stripe.test/cs_1");
});

describe("creator pricing through community onboarding", () => {
  it("rejects values outside the public plan allowlist", async () => {
    await expect(createCommunityAction({}, form("price_attacker"))).resolves.toEqual({
      error: "priceNotAllowed",
    });

    expect(prisma.tenant.create).not.toHaveBeenCalled();
    expect(mocks.startTrackedCreatorPlanCheckout).not.toHaveBeenCalled();
  });

  it("fails closed before creating a paid tenant when billing is unavailable", async () => {
    await expect(createCommunityAction({}, form("PRO"))).resolves.toEqual({
      error: "billingSafety.creditsPausedText",
    });

    expect(prisma.tenant.create).not.toHaveBeenCalled();
    expect(mocks.startTrackedCreatorPlanCheckout).not.toHaveBeenCalled();
  });

  it("creates the FREE wallet without opening Stripe", async () => {
    await expect(createCommunityAction({}, form("FREE"))).rejects.toThrow(
      "REDIRECT:/dashboard/demo-studio",
    );

    expect(mocks.getOrCreateWallet).toHaveBeenCalledWith("t1");
    expect(mocks.startTrackedCreatorPlanCheckout).not.toHaveBeenCalled();
  });

  it("maps a paid plan on the server and redirects to Stripe after tenant creation", async () => {
    mocks.features.creatorBilling = true;

    await expect(createCommunityAction({}, form("PRO"))).rejects.toThrow(
      "REDIRECT:https://checkout.stripe.test/cs_1",
    );

    expect(mocks.startTrackedCreatorPlanCheckout).toHaveBeenCalledWith({
      tenant: { id: "t1", name: "Demo Studio", slug: "demo-studio" },
      user: { id: "u1", email: "owner@example.com" },
      plan: expect.objectContaining({ key: "PRO", priceCents: 4900 }),
      stripeCustomerId: null,
      successUrl: "https://aera.test/dashboard/demo-studio/assistant?billing=success",
      cancelUrl: "https://aera.test/dashboard/demo-studio/assistant?billing=canceled",
    });
  });

  it("keeps the created tenant recoverable when Stripe cannot open checkout", async () => {
    mocks.features.creatorBilling = true;
    mocks.startTrackedCreatorPlanCheckout.mockResolvedValue(null);

    await expect(createCommunityAction({}, form("STARTER"))).rejects.toThrow(
      "REDIRECT:https://aera.test/dashboard/demo-studio/assistant?billing=checkout-error",
    );

    expect(prisma.tenant.create).toHaveBeenCalledOnce();
    expect(mocks.getOrCreateWallet).toHaveBeenCalledWith("t1");
  });
});
