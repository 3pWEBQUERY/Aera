import "server-only";
import { getStripe } from "./stripe";

export type MembershipCancellationResult =
  | { mode: "period_end"; currentPeriodEnd: Date | null }
  | { mode: "immediate"; currentPeriodEnd: null };

export class StripeCleanupError extends Error {
  constructor(
    message: string,
    readonly stripeSubscriptionId?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "StripeCleanupError";
  }
}

export class StripeSubscriptionStillActiveError extends Error {
  constructor(
    readonly stripeSubscriptionId: string,
    readonly stripeStatus: string,
  ) {
    super(`Stripe subscription ${stripeSubscriptionId} is still ${stripeStatus}`);
    this.name = "StripeSubscriptionStillActiveError";
  }
}

function isMissingStripeResource(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "resource_missing";
}

function periodEnd(subscription: unknown): Date | null {
  const raw = subscription as {
    current_period_end?: number;
    items?: { data?: { current_period_end?: number }[] };
  };
  const seconds = raw.current_period_end ?? raw.items?.data?.[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
}

function terminalStatus(status: string): boolean {
  return status === "canceled" || status === "incomplete_expired";
}

async function retrieveSubscription(stripeSubscriptionId: string) {
  const stripe = getStripe();
  if (!stripe) {
    throw new StripeCleanupError(
      "Stripe is not configured; external billing cannot be cleaned up safely.",
      stripeSubscriptionId,
    );
  }
  try {
    return await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (error) {
    // A subscription that no longer exists at Stripe cannot charge again and is
    // therefore safe to treat as externally cleaned up.
    if (isMissingStripeResource(error)) return null;
    throw new StripeCleanupError(
      "Stripe subscription status could not be verified.",
      stripeSubscriptionId,
      { cause: error },
    );
  }
}

/**
 * Member-initiated cancellation keeps already-paid access for healthy active
 * or trialing subscriptions. Recovery states (past_due/unpaid/incomplete) are
 * canceled immediately so Stripe cannot keep retrying charges after the local
 * membership has been downgraded.
 */
export async function cancelMembershipStripeSubscription(
  stripeSubscriptionId: string,
): Promise<MembershipCancellationResult> {
  const stripe = getStripe();
  if (!stripe) {
    throw new StripeCleanupError(
      "Stripe is not configured; the subscription cannot be canceled safely.",
      stripeSubscriptionId,
    );
  }

  const subscription = await retrieveSubscription(stripeSubscriptionId);
  if (!subscription || terminalStatus(subscription.status)) {
    return { mode: "immediate", currentPeriodEnd: null };
  }

  if (subscription.status === "active" || subscription.status === "trialing") {
    try {
      const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      return { mode: "period_end", currentPeriodEnd: periodEnd(updated) };
    } catch (error) {
      throw new StripeCleanupError(
        "Stripe subscription cancellation could not be scheduled.",
        stripeSubscriptionId,
        { cause: error },
      );
    }
  }

  try {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
    return { mode: "immediate", currentPeriodEnd: null };
  } catch (error) {
    if (isMissingStripeResource(error)) {
      return { mode: "immediate", currentPeriodEnd: null };
    }
    throw new StripeCleanupError(
      "Stripe subscription could not be canceled immediately.",
      stripeSubscriptionId,
      { cause: error },
    );
  }
}

/** Cancel every Stripe subscription before an administrator removes a member. */
export async function cancelStripeSubscriptionsImmediately(
  stripeSubscriptionIds: Array<string | null>,
): Promise<void> {
  const ids = [...new Set(stripeSubscriptionIds.filter((id): id is string => !!id))];
  for (const id of ids) {
    const stripe = getStripe();
    if (!stripe) {
      throw new StripeCleanupError(
        "Stripe is not configured; external subscriptions cannot be cleaned up safely.",
        id,
      );
    }
    const subscription = await retrieveSubscription(id);
    if (!subscription || terminalStatus(subscription.status)) continue;
    try {
      await stripe.subscriptions.cancel(id);
    } catch (error) {
      if (isMissingStripeResource(error)) continue;
      throw new StripeCleanupError(
        "Stripe subscription could not be canceled before deletion.",
        id,
        { cause: error },
      );
    }
  }
}

/**
 * Destructive tier/community deletion is allowed only after Stripe confirms
 * that every referenced subscription is terminal. This deliberately blocks
 * instead of silently canceling subscriptions as a side effect of deletion.
 */
export async function assertStripeSubscriptionsInactive(
  stripeSubscriptionIds: Array<string | null>,
): Promise<void> {
  const ids = [...new Set(stripeSubscriptionIds.filter((id): id is string => !!id))];
  for (const id of ids) {
    const subscription = await retrieveSubscription(id);
    if (!subscription || terminalStatus(subscription.status)) continue;
    throw new StripeSubscriptionStillActiveError(id, subscription.status);
  }
}

/**
 * Remove the platform-controlled Express account. Stripe itself rejects this
 * while balances or other obligations remain; that rejection is propagated so
 * callers keep the tenant and its local account reference intact.
 */
export async function deleteStripeConnectAccount(stripeAccountId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe) {
    throw new StripeCleanupError(
      "Stripe is not configured; the connected account cannot be removed safely.",
    );
  }
  try {
    await stripe.accounts.del(stripeAccountId);
  } catch (error) {
    if (isMissingStripeResource(error)) return;
    throw new StripeCleanupError(
      "The Stripe Connect account could not be removed safely.",
      undefined,
      { cause: error },
    );
  }
}
