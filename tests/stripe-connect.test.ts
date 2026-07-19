import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({
  accountRetrieve: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutRetrieve: vi.fn(),
  checkoutExpire: vi.fn(),
  chargeRetrieve: vi.fn(),
  refundList: vi.fn(),
  refundCreate: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  subscriptionCancel: vi.fn(),
  invoicePaymentList: vi.fn(),
  paymentIntentRetrieve: vi.fn(),
  priceRetrieve: vi.fn(),
  transferRetrieve: vi.fn(),
  transferListReversals: vi.fn(),
  transferCreateReversal: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_CREATOR_PRICE_IDS: {
      STARTER: "price_starter",
      PRO: "price_pro",
      SCALE: "price_scale",
    },
  },
  features: { stripe: true, marketplacePayments: true, creatorBilling: true },
}));
vi.mock("stripe", () => ({
  default: class StripeMock {
    accounts = { retrieve: stripeMock.accountRetrieve };
    checkout = {
      sessions: {
        create: stripeMock.checkoutCreate,
        retrieve: stripeMock.checkoutRetrieve,
        expire: stripeMock.checkoutExpire,
      },
    };
    charges = { retrieve: stripeMock.chargeRetrieve };
    refunds = { list: stripeMock.refundList, create: stripeMock.refundCreate };
    subscriptions = {
      retrieve: stripeMock.subscriptionRetrieve,
      cancel: stripeMock.subscriptionCancel,
    };
    invoicePayments = { list: stripeMock.invoicePaymentList };
    paymentIntents = { retrieve: stripeMock.paymentIntentRetrieve };
    prices = { retrieve: stripeMock.priceRetrieve };
    transfers = {
      retrieve: stripeMock.transferRetrieve,
      listReversals: stripeMock.transferListReversals,
      createReversal: stripeMock.transferCreateReversal,
    };
  },
}));

import {
  cancelAndRefundOrphanCreatorSubscription,
  createCreatorPlanCheckout,
  createProductCheckout,
  createProductCheckoutSession,
  createTierCheckout,
  reverseDestinationTransferForDispute,
  reverseDestinationTransferForRefunds,
  retrieveProductCheckoutSession,
} from "@/lib/stripe";

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
  stripeMock.checkoutCreate.mockResolvedValue({
    id: "cs_default",
    url: "https://checkout.stripe.test/session",
    status: "open",
    expires_at: 1_790_208_000,
    subscription: null,
  });
  stripeMock.priceRetrieve.mockResolvedValue({
    id: "price_pro",
    active: true,
    currency: "eur",
    unit_amount: 4900,
    type: "recurring",
    recurring: { interval: "month", interval_count: 1 },
  });
  stripeMock.transferRetrieve.mockResolvedValue({
    id: "tr_1",
    amount: 9500,
    amount_reversed: 0,
  });
  stripeMock.transferListReversals.mockReturnValue({
    autoPagingToArray: vi.fn().mockResolvedValue([]),
  });
  stripeMock.transferCreateReversal.mockResolvedValue({ id: "trr_1", amount: 4750 });
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

  it("binds reserved inventory to Stripe metadata and an idempotency key", async () => {
    stripeMock.accountRetrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });
    stripeMock.checkoutCreate.mockResolvedValue({
      id: "cs_reserved",
      url: "https://checkout.stripe.test/reserved",
      status: "open",
    });
    const expiresAt = new Date("2026-07-18T11:31:00.000Z");

    const session = await createProductCheckoutSession({
      tenant,
      product: { id: "p1", name: "Book", priceCents: 1000, currency: "eur" },
      user,
      reservation: { orderId: "ord1", expiresAt },
      successUrl: "https://aera.test/success",
      cancelUrl: "https://aera.test/cancel",
    });

    expect(session).toMatchObject({ id: "cs_reserved", status: "open" });
    expect(stripeMock.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        metadata: expect.objectContaining({ orderId: "ord1" }),
        payment_intent_data: expect.objectContaining({
          metadata: expect.objectContaining({ orderId: "ord1" }),
        }),
      }),
      { idempotencyKey: "aera:product-order:ord1" },
    );
  });

  it("retrieves an existing immutable Session instead of recreating it", async () => {
    stripeMock.checkoutRetrieve.mockResolvedValue({
      id: "cs_existing",
      url: "https://checkout.stripe.test/existing",
      status: "open",
    });

    const session = await retrieveProductCheckoutSession("cs_existing");

    expect(session).toMatchObject({ id: "cs_existing", status: "open" });
    expect(stripeMock.checkoutRetrieve).toHaveBeenCalledWith("cs_existing");
    expect(stripeMock.checkoutCreate).not.toHaveBeenCalled();
  });
});

describe("creator-plan checkout catalog safety", () => {
  it("uses the fixed server-side Stripe Price and an idempotency key", async () => {
    const url = await createCreatorPlanCheckout({
      tenant: { id: "t1", name: "Demo", slug: "demo" },
      plan: { key: "PRO", name: "Pro", monthlyCredits: 12000, priceCents: 4900 },
      user,
      successUrl: "https://aera.test/success",
      cancelUrl: "https://aera.test/cancel",
      idempotencyKey: "creator-plan-onboarding:t1:PRO",
    });

    expect(url).toContain("checkout.stripe.test");
    expect(stripeMock.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ quantity: 1, price: "price_pro" }],
        metadata: expect.objectContaining({
          kind: "creator_plan",
          tenantId: "t1",
          plan: "PRO",
        }),
      }),
      { idempotencyKey: "creator-plan-onboarding:t1:PRO" },
    );
  });

  it("rejects a client-shaped plan outside the paid catalog", async () => {
    const url = await createCreatorPlanCheckout({
      tenant: { id: "t1", name: "Demo", slug: "demo" },
      plan: { key: "price_attacker", name: "Fake", monthlyCredits: 999999, priceCents: 1 },
      user,
      successUrl: "https://aera.test/success",
      cancelUrl: "https://aera.test/cancel",
    });

    expect(url).toBeNull();
    expect(stripeMock.checkoutCreate).not.toHaveBeenCalled();
  });

  it("fails closed when the configured Price does not match the local plan", async () => {
    stripeMock.priceRetrieve.mockResolvedValue({
      id: "price_pro",
      active: true,
      currency: "eur",
      unit_amount: 100,
      type: "recurring",
      recurring: { interval: "month", interval_count: 1 },
    });

    const url = await createCreatorPlanCheckout({
      tenant: { id: "t1", name: "Demo", slug: "demo" },
      plan: { key: "PRO", name: "Pro", monthlyCredits: 12000, priceCents: 4900 },
      user,
      successUrl: "https://aera.test/success",
      cancelUrl: "https://aera.test/cancel",
    });

    expect(url).toBeNull();
    expect(stripeMock.checkoutCreate).not.toHaveBeenCalled();
  });
});

describe("orphan creator subscription cleanup", () => {
  it("cancels recurring billing and refunds the paid invoice with stable keys", async () => {
    stripeMock.subscriptionRetrieve.mockResolvedValue({
      id: "sub_orphan",
      status: "active",
      latest_invoice: "in_first",
    });
    stripeMock.subscriptionCancel.mockResolvedValue({ id: "sub_orphan", status: "canceled" });
    stripeMock.invoicePaymentList.mockReturnValue({
      autoPagingToArray: vi.fn().mockResolvedValue([
        {
          id: "inpay_1",
          status: "paid",
          amount_paid: 4900,
          payment: { type: "payment_intent", payment_intent: "pi_first" },
        },
      ]),
    });
    stripeMock.paymentIntentRetrieve.mockResolvedValue({
      id: "pi_first",
      latest_charge: { id: "ch_first", amount: 4900, amount_refunded: 0 },
    });
    stripeMock.refundCreate.mockResolvedValue({ id: "re_first", amount: 4900 });

    const result = await cancelAndRefundOrphanCreatorSubscription({
      stripeSubscriptionId: "sub_orphan",
    });

    expect(result).toEqual({ subscriptionCanceled: true, refundedCents: 4900 });
    expect(stripeMock.subscriptionCancel).toHaveBeenCalledWith(
      "sub_orphan",
      { invoice_now: false, prorate: false },
      { idempotencyKey: "aera:cancel-orphan-creator:sub_orphan" },
    );
    expect(stripeMock.invoicePaymentList).toHaveBeenCalledWith({
      invoice: "in_first",
      status: "paid",
      limit: 100,
    });
    expect(stripeMock.refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ charge: "ch_first", amount: 4900 }),
      { idempotencyKey: "aera:refund-orphan-creator:inpay_1" },
    );
  });
});

describe("destination-charge recovery", () => {
  it("reverses only the proportional creator share for a partial refund", async () => {
    stripeMock.refundList.mockReturnValue({
      autoPagingToArray: vi.fn().mockResolvedValue([
        {
          id: "re_partial",
          amount: 5000,
          status: "succeeded",
          transfer_reversal: null,
        },
      ]),
    });

    const result = await reverseDestinationTransferForRefunds({
      id: "ch_1",
      amount: 10000,
      transfer: "tr_1",
    } as never);

    expect(result).toEqual({ reversedCents: 4750, alreadyReversedCents: 0 });
    expect(stripeMock.transferCreateReversal).toHaveBeenCalledWith(
      "tr_1",
      expect.objectContaining({
        amount: 4750,
        refund_application_fee: true,
        metadata: expect.objectContaining({ stripeRefundId: "re_partial" }),
      }),
      { idempotencyKey: "aera:refund-transfer:re_partial" },
    );
  });

  it("does not reverse a refund twice when Stripe already linked a reversal", async () => {
    stripeMock.transferRetrieve.mockResolvedValue({
      id: "tr_1",
      amount: 9500,
      amount_reversed: 4750,
    });
    stripeMock.refundList.mockReturnValue({
      autoPagingToArray: vi.fn().mockResolvedValue([
        {
          id: "re_linked",
          amount: 5000,
          status: "succeeded",
          transfer_reversal: "trr_existing",
        },
      ]),
    });

    const result = await reverseDestinationTransferForRefunds({
      id: "ch_1",
      amount: 10000,
      transfer: "tr_1",
    } as never);

    expect(result).toEqual({ reversedCents: 0, alreadyReversedCents: 4750 });
    expect(stripeMock.transferCreateReversal).not.toHaveBeenCalled();
  });

  it("uses one stable reversal per dispute and skips it after a replay", async () => {
    stripeMock.chargeRetrieve.mockResolvedValue({
      id: "ch_1",
      amount: 10000,
      transfer: "tr_1",
    });
    const dispute = { id: "dp_1", amount: 5000, charge: "ch_1" } as never;

    await reverseDestinationTransferForDispute(dispute);

    expect(stripeMock.transferCreateReversal).toHaveBeenCalledWith(
      "tr_1",
      {
        amount: 4750,
        metadata: {
          aeraReason: "stripe_dispute",
          stripeChargeId: "ch_1",
          stripeDisputeId: "dp_1",
        },
      },
      { idempotencyKey: "aera:dispute-transfer:dp_1" },
    );

    stripeMock.transferListReversals.mockReturnValue({
      autoPagingToArray: vi.fn().mockResolvedValue([
        { id: "trr_1", amount: 4750, metadata: { stripeDisputeId: "dp_1" } },
      ]),
    });
    stripeMock.transferCreateReversal.mockClear();

    const replay = await reverseDestinationTransferForDispute(dispute);

    expect(replay).toEqual({ reversedCents: 0, alreadyReversedCents: 4750 });
    expect(stripeMock.transferCreateReversal).not.toHaveBeenCalled();
  });
});
