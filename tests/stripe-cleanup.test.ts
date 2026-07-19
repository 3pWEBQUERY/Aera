import { beforeEach, describe, expect, it, vi } from "vitest";

const stripe = vi.hoisted(() => ({
  retrieve: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
  deleteAccount: vi.fn(),
}));
const mocks = vi.hoisted(() => ({ getStripe: vi.fn() }));

vi.mock("@/lib/stripe", () => ({ getStripe: mocks.getStripe }));

import {
  assertStripeSubscriptionsInactive,
  cancelMembershipStripeSubscription,
  cancelStripeSubscriptionsImmediately,
  deleteStripeConnectAccount,
  StripeCleanupError,
  StripeSubscriptionStillActiveError,
} from "@/lib/stripe-cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getStripe.mockReturnValue({
    subscriptions: {
      retrieve: stripe.retrieve,
      update: stripe.update,
      cancel: stripe.cancel,
    },
    accounts: { del: stripe.deleteAccount },
  });
});

describe("Stripe cleanup safety", () => {
  it("keeps active subscriptions until the paid period end", async () => {
    stripe.retrieve.mockResolvedValue({ status: "active" });
    stripe.update.mockResolvedValue({ status: "active", current_period_end: 1_800_000_000 });

    const result = await cancelMembershipStripeSubscription("sub_active");

    expect(result).toEqual({
      mode: "period_end",
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
    });
    expect(stripe.update).toHaveBeenCalledWith("sub_active", { cancel_at_period_end: true });
    expect(stripe.cancel).not.toHaveBeenCalled();
  });

  it.each(["past_due", "unpaid", "incomplete"])(
    "cancels a %s subscription immediately so retries cannot continue",
    async (status) => {
      stripe.retrieve.mockResolvedValue({ status });
      stripe.cancel.mockResolvedValue({ status: "canceled" });

      await expect(cancelMembershipStripeSubscription(`sub_${status}`)).resolves.toEqual({
        mode: "immediate",
        currentPeriodEnd: null,
      });
      expect(stripe.cancel).toHaveBeenCalledWith(`sub_${status}`);
      expect(stripe.update).not.toHaveBeenCalled();
    },
  );

  it("fails closed when Stripe is unavailable", async () => {
    mocks.getStripe.mockReturnValue(null);

    await expect(cancelMembershipStripeSubscription("sub_live")).rejects.toBeInstanceOf(
      StripeCleanupError,
    );
    expect(stripe.cancel).not.toHaveBeenCalled();
  });

  it("cancels all non-terminal subscriptions before administrative removal", async () => {
    stripe.retrieve
      .mockResolvedValueOnce({ status: "active" })
      .mockResolvedValueOnce({ status: "canceled" });
    stripe.cancel.mockResolvedValue({ status: "canceled" });

    await cancelStripeSubscriptionsImmediately(["sub_live", "sub_done", "sub_live"]);

    expect(stripe.cancel).toHaveBeenCalledTimes(1);
    expect(stripe.cancel).toHaveBeenCalledWith("sub_live");
  });

  it("blocks destructive deletion while Stripe still reports a live subscription", async () => {
    stripe.retrieve.mockResolvedValue({ status: "unpaid" });

    await expect(assertStripeSubscriptionsInactive(["sub_unpaid"])).rejects.toBeInstanceOf(
      StripeSubscriptionStillActiveError,
    );
  });

  it("allows deletion only for terminal or already missing subscriptions", async () => {
    stripe.retrieve
      .mockResolvedValueOnce({ status: "canceled" })
      .mockRejectedValueOnce({ code: "resource_missing" });

    await expect(
      assertStripeSubscriptionsInactive(["sub_done", "sub_missing"]),
    ).resolves.toBeUndefined();
  });

  it("removes the external Connect account before callers clear the local reference", async () => {
    stripe.deleteAccount.mockResolvedValue({ id: "acct_1", deleted: true });

    await deleteStripeConnectAccount("acct_1");

    expect(stripe.deleteAccount).toHaveBeenCalledWith("acct_1");
  });
});
