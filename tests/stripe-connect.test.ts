import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({
  accountRetrieve: vi.fn(),
  checkoutCreate: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: { STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec_test" },
  features: { stripe: true },
}));
vi.mock("stripe", () => ({
  default: class StripeMock {
    accounts = { retrieve: stripeMock.accountRetrieve };
    checkout = { sessions: { create: stripeMock.checkoutCreate } };
  },
}));

import { createProductCheckout, createTierCheckout } from "@/lib/stripe";

const tenant = {
  id: "t1",
  name: "Demo",
  slug: "demo",
  platformFeePercent: 5,
  stripeAccountId: "acct_1" as string | null,
};
const user = { id: "u1", email: "member@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  stripeMock.checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
});

describe("marketplace checkout Connect safety", () => {
  it("fails closed when the tenant has no connected account", async () => {
    const url = await createProductCheckout({
      tenant: { ...tenant, stripeAccountId: null },
      product: { id: "p1", name: "Book", priceCents: 1000, currency: "eur" },
      user,
      successUrl: "https://aera.test/success",
      cancelUrl: "https://aera.test/cancel",
    });

    expect(url).toBeNull();
    expect(stripeMock.checkoutCreate).not.toHaveBeenCalled();
  });

  it("fails closed while Stripe charges or payouts are disabled", async () => {
    stripeMock.accountRetrieve.mockResolvedValue({
      charges_enabled: false,
      payouts_enabled: true,
      details_submitted: true,
    });

    const url = await createTierCheckout({
      tenant,
      tier: { id: "tier1", name: "Pro", priceCents: 2000, currency: "eur", interval: "MONTH" },
      user,
      successUrl: "https://aera.test/success",
      cancelUrl: "https://aera.test/cancel",
    });

    expect(url).toBeNull();
    expect(stripeMock.checkoutCreate).not.toHaveBeenCalled();
  });

  it("always creates an enabled destination charge with the platform fee", async () => {
    stripeMock.accountRetrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });

    const url = await createProductCheckout({
      tenant,
      product: { id: "p1", name: "Book", priceCents: 1000, currency: "eur" },
      user,
      successUrl: "https://aera.test/success",
      cancelUrl: "https://aera.test/cancel",
    });

    expect(url).toContain("checkout.stripe.test");
    expect(stripeMock.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({
          application_fee_amount: 50,
          transfer_data: { destination: "acct_1" },
        }),
      }),
    );
  });
});
