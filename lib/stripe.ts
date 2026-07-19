import "server-only";
import Stripe from "stripe";
import { env, features } from "./env";
import { PLATFORM_CURRENCY } from "./currency";
import {
  immediatePerformanceConsentMetadata,
  type ImmediatePerformanceConsent,
} from "./legal";

let _stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (!features.stripe) return null;
  if (!_stripe) _stripe = new Stripe(env.STRIPE_SECRET_KEY);
  return _stripe;
}

export function platformFeeCents(amountCents: number, feePercent: number): number {
  return Math.round((amountCents * feePercent) / 100);
}

function stripeObjectId(value: { id: string } | string | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export interface TransferReversalSummary {
  reversedCents: number;
  alreadyReversedCents: number;
}

function proportionalCreatorAmount(
  grossAmountCents: number,
  chargeAmountCents: number,
  transferAmountCents: number,
): number {
  if (grossAmountCents <= 0 || chargeAmountCents <= 0 || transferAmountCents <= 0) return 0;
  return Math.min(
    transferAmountCents,
    Math.round((grossAmountCents * transferAmountCents) / chargeAmountCents),
  );
}

/**
 * Recover destination-charge funds from the connected account after Stripe has
 * already created a refund (for example, from the Stripe Dashboard).
 *
 * A refund created by our own code with `reverse_transfer` already contains a
 * `transfer_reversal`; those refunds are intentionally skipped. For external
 * refunds, one stable idempotency key per Stripe Refund makes webhook retries
 * safe and also handles multiple partial refunds independently.
 */
export async function reverseDestinationTransferForRefunds(
  charge: Stripe.Charge,
): Promise<TransferReversalSummary> {
  const transferId = stripeObjectId(charge.transfer);
  if (!transferId) return { reversedCents: 0, alreadyReversedCents: 0 };

  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is required to reverse a destination transfer");
  }

  const refunds = await stripe.refunds
    .list({ charge: charge.id, limit: 100 })
    .autoPagingToArray({ limit: 1000 });
  const transfer = await stripe.transfers.retrieve(transferId);
  const reversals = await stripe.transfers
    .listReversals(transferId, { limit: 100 })
    .autoPagingToArray({ limit: 1000 });
  let reversedCents = 0;
  const alreadyReversedCents = transfer.amount_reversed;
  let remainingCents = Math.max(0, transfer.amount - transfer.amount_reversed);

  for (const refund of refunds) {
    // A pending/failed refund must not claw money back from the creator yet.
    if (refund.status !== "succeeded") continue;
    if (refund.transfer_reversal) continue;
    if (reversals.some((item) => item.metadata?.stripeRefundId === refund.id)) continue;

    const creatorShareCents = Math.min(
      remainingCents,
      proportionalCreatorAmount(refund.amount, charge.amount, transfer.amount),
    );
    if (creatorShareCents <= 0) continue;

    await stripe.transfers.createReversal(
      transferId,
      {
        amount: creatorShareCents,
        refund_application_fee: true,
        metadata: {
          aeraReason: "stripe_refund",
          stripeChargeId: charge.id,
          stripeRefundId: refund.id,
        },
      },
      { idempotencyKey: `aera:refund-transfer:${refund.id}` },
    );
    reversedCents += creatorShareCents;
    remainingCents -= creatorShareCents;
  }

  return { reversedCents, alreadyReversedCents };
}

/**
 * Recover the disputed portion of a destination charge from the connected
 * account. `charge.dispute.created` and a later `closed/lost` event share the
 * same idempotency key, so Stripe can never execute this reversal twice.
 */
export async function reverseDestinationTransferForDispute(
  dispute: Stripe.Dispute,
): Promise<TransferReversalSummary> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is required to inspect a disputed destination charge");
  }

  const charge =
    typeof dispute.charge === "string"
      ? await stripe.charges.retrieve(dispute.charge)
      : dispute.charge;
  const transferId = stripeObjectId(charge.transfer);
  if (!transferId) return { reversedCents: 0, alreadyReversedCents: 0 };

  const transfer = await stripe.transfers.retrieve(transferId);
  const reversals = await stripe.transfers
    .listReversals(transferId, { limit: 100 })
    .autoPagingToArray({ limit: 1000 });
  const existing = reversals.find(
    (item) => item.metadata?.stripeDisputeId === dispute.id,
  );
  if (existing) {
    return { reversedCents: 0, alreadyReversedCents: existing.amount };
  }
  const remainingCents = Math.max(0, transfer.amount - transfer.amount_reversed);
  const creatorShareCents = Math.min(
    remainingCents,
    proportionalCreatorAmount(dispute.amount, charge.amount, transfer.amount),
  );
  if (creatorShareCents <= 0) {
    return { reversedCents: 0, alreadyReversedCents: transfer.amount_reversed };
  }

  await stripe.transfers.createReversal(
    transferId,
    {
      amount: creatorShareCents,
      metadata: {
        aeraReason: "stripe_dispute",
        stripeChargeId: charge.id,
        stripeDisputeId: dispute.id,
      },
    },
    { idempotencyKey: `aera:dispute-transfer:${dispute.id}` },
  );
  return { reversedCents: creatorShareCents, alreadyReversedCents: transfer.amount_reversed };
}

// ---------------------------------------------------------------- Connect (Express)
/** Create an Express connected account so the creator can receive payouts. */
export async function createConnectAccount(email: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const account = await stripe.accounts.create({
    type: "express",
    ...(email ? { email } : {}),
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return account.id;
}

/** Hosted onboarding link the creator is redirected to. Links are single-use. */
export async function createOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

export interface ConnectStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

/** Live onboarding/capability status for a connected account. */
export async function getConnectStatus(accountId: string): Promise<ConnectStatus | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const a = await stripe.accounts.retrieve(accountId);
    return {
      chargesEnabled: !!a.charges_enabled,
      payoutsEnabled: !!a.payouts_enabled,
      detailsSubmitted: !!a.details_submitted,
    };
  } catch {
    return null;
  }
}

/** One-time link into the creator's Express dashboard (manage payouts etc.). */
export async function createDashboardLoginLink(accountId: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const link = await stripe.accounts.createLoginLink(accountId);
    return link.url;
  } catch {
    return null;
  }
}

interface CheckoutUser {
  id: string;
  email: string;
}
interface CheckoutTenant {
  id: string;
  name: string;
  slug: string;
  platformFeePercent: number;
  stripeAccountId: string | null;
}

/** Paid marketplace checkouts must never fall back to a platform-only charge. */
async function readyConnectDestination(tenant: CheckoutTenant): Promise<string | null> {
  if (!features.marketplacePayments) return null;
  if (!tenant.stripeAccountId) return null;
  const status = await getConnectStatus(tenant.stripeAccountId);
  if (!status?.chargesEnabled || !status.payoutsEnabled || !status.detailsSubmitted) return null;
  return tenant.stripeAccountId;
}

export interface CreatorBillingTenant {
  id: string;
  name: string;
  slug: string;
}

/** Create a platform-owned one-time Checkout Session for AI credits. */
export async function createCreditPackCheckout(args: {
  tenant: CreatorBillingTenant;
  pack: { id: string; credits: number; priceCents: number };
  user: CheckoutUser;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  if (!features.creatorBilling) return null;
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, pack, user } = args;
  const metadata = {
    kind: "ai_credit_pack",
    tenantId: tenant.id,
    userId: user.id,
    packId: pack.id,
  };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: PLATFORM_CURRENCY,
          unit_amount: pack.priceCents,
          product_data: {
            name: `${tenant.name} — ${pack.credits.toLocaleString("de-DE")} AI-Credits`,
          },
        },
      },
    ],
    payment_intent_data: { metadata },
    metadata,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return session.url;
}

export interface CreatorPlanCheckoutArgs {
  tenant: CreatorBillingTenant;
  plan: {
    key: string;
    name: string;
    monthlyCredits: number;
    priceCents: number;
  };
  user: CheckoutUser;
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
  pendingCreatorCheckoutId?: string;
}

export interface CreatorPlanCheckoutSession {
  id: string;
  url: string | null;
  status: Stripe.Checkout.Session.Status | null;
  expiresAt: Date;
  stripeSubscriptionId: string | null;
}

function creatorCheckoutSession(
  session: Stripe.Checkout.Session,
): CreatorPlanCheckoutSession {
  return {
    id: session.id,
    url: session.url,
    status: session.status,
    expiresAt: new Date(session.expires_at * 1000),
    stripeSubscriptionId: stripeObjectId(session.subscription),
  };
}

async function validCreatorCatalogPrice(
  stripe: Stripe,
  priceId: string,
  expectedCents: number,
): Promise<boolean> {
  try {
    const price = await stripe.prices.retrieve(priceId);
    return (
      price.active &&
      price.currency === PLATFORM_CURRENCY &&
      price.unit_amount === expectedCents &&
      price.type === "recurring" &&
      price.recurring?.interval === "month" &&
      price.recurring.interval_count === 1
    );
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "resource_missing") return false;
    throw error;
  }
}

/** Create a platform-owned monthly subscription for a creator AI plan. */
export async function createCreatorPlanCheckoutSession(
  args: CreatorPlanCheckoutArgs,
): Promise<CreatorPlanCheckoutSession | null> {
  if (!features.creatorBilling) return null;
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, plan, user } = args;
  const paidPlanKey =
    plan.key === "STARTER" || plan.key === "PRO" || plan.key === "SCALE"
      ? plan.key
      : null;
  if (!paidPlanKey || plan.priceCents <= 0) return null;
  const metadata = {
    kind: "creator_plan",
    tenantId: tenant.id,
    userId: user.id,
    plan: plan.key,
    ...(args.pendingCreatorCheckoutId
      ? { pendingCreatorCheckoutId: args.pendingCreatorCheckoutId }
      : {}),
  };
  const configuredPriceId = env.STRIPE_CREATOR_PRICE_IDS?.[paidPlanKey] ?? "";
  // Live checkouts fail closed when the fixed catalog is incomplete. The
  // price_data branch deliberately exists for local/test environments only.
  if (process.env.NODE_ENV === "production" && !configuredPriceId) return null;
  if (
    configuredPriceId &&
    !(await validCreatorCatalogPrice(stripe, configuredPriceId, plan.priceCents))
  ) {
    return null;
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    ...(args.stripeCustomerId
      ? { customer: args.stripeCustomerId }
      : { customer_email: user.email }),
    client_reference_id: user.id,
    line_items: [
      configuredPriceId
        ? { quantity: 1, price: configuredPriceId }
        : {
            quantity: 1,
            price_data: {
              currency: PLATFORM_CURRENCY,
              unit_amount: plan.priceCents,
              recurring: { interval: "month" },
              product_data: {
                name: `${tenant.name} — Aera ${plan.name}`,
                description: `${plan.monthlyCredits.toLocaleString("de-DE")} AI-Credits pro Monat`,
              },
            },
          },
    ],
    subscription_data: { metadata },
    metadata,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  };
  const session = args.idempotencyKey
    ? await stripe.checkout.sessions.create(params, {
        idempotencyKey: args.idempotencyKey.slice(0, 255),
      })
    : await stripe.checkout.sessions.create(params);
  return creatorCheckoutSession(session);
}

/** Backwards-compatible URL helper for untracked callers. */
export async function createCreatorPlanCheckout(
  args: CreatorPlanCheckoutArgs,
): Promise<string | null> {
  const session = await createCreatorPlanCheckoutSession(args);
  return session?.url ?? null;
}

/** Resume a tracked Session without replaying possibly changed Checkout params. */
export async function retrieveCreatorPlanCheckoutSession(
  stripeSessionId: string,
): Promise<CreatorPlanCheckoutSession | null> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is required to verify a creator checkout");
  try {
    const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
    return creatorCheckoutSession(session);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "resource_missing") return null;
    throw error;
  }
}

/** Expire an abandoned Session if Stripe still considers it open. */
export async function expireCreatorPlanCheckoutSession(
  stripeSessionId: string,
): Promise<Stripe.Checkout.Session | null> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is required to expire a creator checkout");
  try {
    const current = await stripe.checkout.sessions.retrieve(stripeSessionId);
    if (current.status !== "open") return current;
    return await stripe.checkout.sessions.expire(stripeSessionId, undefined, {
      idempotencyKey: `aera:expire-creator-checkout:${stripeSessionId}`,
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "resource_missing") return null;
    throw error;
  }
}

export interface OrphanCreatorSubscriptionCleanup {
  subscriptionCanceled: boolean;
  refundedCents: number;
}

/**
 * Last-resort money safety for a completed creator checkout whose tenant was
 * deleted concurrently. Stop recurring billing first, then refund its paid
 * invoice using Stripe-only identifiers (no tenant row is required).
 */
export async function cancelAndRefundOrphanCreatorSubscription(args: {
  stripeSubscriptionId: string;
  stripeInvoiceId?: string | null;
  reverseDestinationTransfer?: boolean;
}): Promise<OrphanCreatorSubscriptionCleanup> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is required to clean up an orphan subscription");

  let invoiceId = args.stripeInvoiceId ?? null;
  let subscriptionCanceled = false;
  try {
    const subscription = await stripe.subscriptions.retrieve(args.stripeSubscriptionId);
    invoiceId = invoiceId ?? stripeObjectId(subscription.latest_invoice);
    if (subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
      await stripe.subscriptions.cancel(
        args.stripeSubscriptionId,
        { invoice_now: false, prorate: false },
        { idempotencyKey: `aera:cancel-orphan-creator:${args.stripeSubscriptionId}` },
      );
      subscriptionCanceled = true;
    }
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "resource_missing") throw error;
  }

  if (!invoiceId) return { subscriptionCanceled, refundedCents: 0 };
  const payments = await stripe.invoicePayments
    .list({ invoice: invoiceId, status: "paid", limit: 100 })
    .autoPagingToArray({ limit: 1000 });
  let refundedCents = 0;

  for (const payment of payments) {
    const paidCents = Math.max(0, payment.amount_paid ?? 0);
    if (paidCents === 0) continue;

    let charge: Stripe.Charge | null = null;
    const paymentIntentId = stripeObjectId(payment.payment.payment_intent);
    const directChargeId = stripeObjectId(payment.payment.charge);
    if (paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const latestCharge = paymentIntent.latest_charge;
      charge =
        typeof latestCharge === "string"
          ? await stripe.charges.retrieve(latestCharge)
          : latestCharge;
    } else if (directChargeId) {
      charge = await stripe.charges.retrieve(directChargeId);
    }
    if (!charge) continue;

    const amount = Math.min(paidCents, Math.max(0, charge.amount - charge.amount_refunded));
    if (amount === 0) continue;
    await stripe.refunds.create(
      {
        charge: charge.id,
        amount,
        ...(args.reverseDestinationTransfer
          ? { reverse_transfer: true, refund_application_fee: true }
          : {}),
        metadata: {
          aeraReason: args.reverseDestinationTransfer
            ? "orphan_tier_checkout"
            : "orphan_creator_checkout",
          stripeSubscriptionId: args.stripeSubscriptionId,
          stripeInvoiceId: invoiceId,
          stripeInvoicePaymentId: payment.id,
        },
      },
      {
        idempotencyKey: `aera:refund-orphan-${
          args.reverseDestinationTransfer ? "tier" : "creator"
        }:${payment.id}`,
      },
    );
    refundedCents += amount;
  }

  return { subscriptionCanceled, refundedCents };
}

/** Create a subscription Checkout Session for a membership tier. */
export async function createTierCheckout(args: {
  tenant: CheckoutTenant;
  tier: {
    id: string;
    name: string;
    priceCents: number;
    currency: string;
    interval: "MONTH" | "YEAR";
  };
  user: CheckoutUser;
  successUrl: string;
  cancelUrl: string;
  consent?: ImmediatePerformanceConsent;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, tier, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;
  const interval = tier.interval === "YEAR" ? "year" : "month";

  const legalMetadata = args.consent
    ? immediatePerformanceConsentMetadata(args.consent)
    : {};
  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: {
      tenantId: tenant.id,
      tierId: tier.id,
      userId: user.id,
      ...legalMetadata,
    },
  };
  subscriptionData.application_fee_percent = tenant.platformFeePercent;
  subscriptionData.transfer_data = { destination };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: tier.currency,
          unit_amount: tier.priceCents,
          recurring: { interval },
          product_data: { name: `${tenant.name} — ${tier.name}` },
        },
      },
    ],
    subscription_data: subscriptionData,
    metadata: {
      kind: "tier",
      tenantId: tenant.id,
      tierId: tier.id,
      userId: user.id,
      ...legalMetadata,
    },
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return session.url;
}

type ProductCheckoutArgs = {
  tenant: CheckoutTenant;
  product: {
    id: string;
    name: string;
    priceCents: number;
    currency: string;
    requiresShipping?: boolean;
    freeShipping?: boolean;
    shippingCents?: number;
  };
  user: CheckoutUser;
  successUrl: string;
  cancelUrl: string;
  reservation?: { orderId: string; expiresAt: Date };
  consent?: ImmediatePerformanceConsent;
};

export interface ProductCheckoutSession {
  id: string;
  url: string | null;
  status: Stripe.Checkout.Session.Status | null;
}

export function isDefinitiveStripeRequestError(error: unknown): boolean {
  const type =
    typeof error === "object" && error !== null && "type" in error
      ? String(error.type)
      : error instanceof Error
        ? error.name
        : "";
  return new Set([
    "StripeInvalidRequestError",
    "StripeAuthenticationError",
    "StripePermissionError",
    "StripeIdempotencyError",
  ]).has(type);
}

/** Load the immutable existing Session instead of replaying changed params. */
export async function retrieveProductCheckoutSession(
  stripeSessionId: string,
): Promise<ProductCheckoutSession | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
  return { id: session.id, url: session.url, status: session.status };
}

/**
 * Create the Stripe session behind a durable product reservation. The order id
 * is both webhook metadata and the Stripe idempotency boundary.
 */
export async function createProductCheckoutSession(
  args: ProductCheckoutArgs,
): Promise<ProductCheckoutSession | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, product, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const metadata = {
    kind: "product",
    tenantId: tenant.id,
    productId: product.id,
    userId: user.id,
    ...(args.reservation ? { orderId: args.reservation.orderId } : {}),
    ...(args.consent ? immediatePerformanceConsentMetadata(args.consent) : {}),
  };

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData =
    { metadata };
  paymentIntentData.application_fee_amount = platformFeeCents(
    product.priceCents,
    tenant.platformFeePercent,
  );
  paymentIntentData.transfer_data = { destination };

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: product.currency,
          unit_amount: product.priceCents,
          product_data: { name: product.name },
        },
      },
    ],
    payment_intent_data: paymentIntentData,
    metadata,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  };
  if (args.reservation) {
    params.expires_at = Math.floor(args.reservation.expiresAt.getTime() / 1000);
  }

  // Physical product: collect a shipping address and add a shipping rate.
  if (product.requiresShipping) {
    params.shipping_address_collection = {
      allowed_countries: [
        "DE", "AT", "CH", "NL", "BE", "LU", "FR", "IT", "ES", "PL", "DK", "SE", "FI", "CZ", "PT", "IE",
      ],
    };
    const amount = product.freeShipping ? 0 : Math.max(0, product.shippingCents ?? 0);
    params.shipping_options = [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount, currency: product.currency },
          display_name: product.freeShipping ? "Kostenloser Versand" : "Versand",
        },
      },
    ];
  }

  const session = args.reservation
    ? await stripe.checkout.sessions.create(params, {
        idempotencyKey: `aera:product-order:${args.reservation.orderId}`,
      })
    : await stripe.checkout.sessions.create(params);
  if (!session.url) return null;
  return { id: session.id, url: session.url, status: session.status };
}

/** Backwards-compatible URL helper for callers without stock reservations. */
export async function createProductCheckout(
  args: ProductCheckoutArgs,
): Promise<string | null> {
  const session = await createProductCheckoutSession(args);
  return session?.url ?? null;
}

/** Create a one-time payment Checkout Session for a media package. */
export async function createMediaCheckout(args: {
  tenant: CheckoutTenant;
  pkg: { id: string; title: string; priceCents: number; currency: string };
  user: CheckoutUser;
  successUrl: string;
  cancelUrl: string;
  consent?: ImmediatePerformanceConsent;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, pkg, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const metadata = {
    kind: "media",
    tenantId: tenant.id,
    mediaPackageId: pkg.id,
    userId: user.id,
    ...(args.consent ? immediatePerformanceConsentMetadata(args.consent) : {}),
  };
  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata,
  };
  paymentIntentData.application_fee_amount = platformFeeCents(pkg.priceCents, tenant.platformFeePercent);
  paymentIntentData.transfer_data = { destination };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: pkg.currency,
          unit_amount: pkg.priceCents,
          product_data: { name: pkg.title },
        },
      },
    ],
    payment_intent_data: paymentIntentData,
    metadata,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return session.url;
}

/** Create a one-time payment Checkout Session for a priced member request. */
export async function createRequestCheckout(args: {
  tenant: CheckoutTenant;
  request: { id: string; title: string; priceCents: number; currency: string };
  user: CheckoutUser;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, request, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata: { kind: "request", tenantId: tenant.id, requestId: request.id, userId: user.id },
  };
  paymentIntentData.application_fee_amount = platformFeeCents(request.priceCents, tenant.platformFeePercent);
  paymentIntentData.transfer_data = { destination };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: request.currency,
          unit_amount: request.priceCents,
          product_data: { name: request.title },
        },
      },
    ],
    payment_intent_data: paymentIntentData,
    metadata: { kind: "request", tenantId: tenant.id, requestId: request.id, userId: user.id },
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return session.url;
}

/** Create a one-time payment Checkout Session for a booking slot. */
export async function createBookingCheckout(args: {
  tenant: CheckoutTenant;
  booking: { reservationId: string; title: string; priceCents: number; currency: string };
  user: CheckoutUser;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, booking, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata: { kind: "booking", tenantId: tenant.id, reservationId: booking.reservationId, userId: user.id },
  };
  paymentIntentData.application_fee_amount = platformFeeCents(booking.priceCents, tenant.platformFeePercent);
  paymentIntentData.transfer_data = { destination };

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: user.email,
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: booking.currency,
            unit_amount: booking.priceCents,
            product_data: { name: booking.title },
          },
        },
      ],
      payment_intent_data: paymentIntentData,
      metadata: { kind: "booking", tenantId: tenant.id, reservationId: booking.reservationId, userId: user.id },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    },
    {
      idempotencyKey: `aera:booking-reservation:${booking.reservationId}`,
    },
  );
  return session.url ? { id: session.id, url: session.url } : null;
}

/** Create a one-time Checkout Session for a tip of an arbitrary amount. */
export async function createTipCheckout(args: {
  tenant: CheckoutTenant;
  tip: { id: string; amountCents: number; currency: string; label: string };
  user: CheckoutUser;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, tip, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata: { kind: "tip", tenantId: tenant.id, tipId: tip.id, userId: user.id },
  };
  paymentIntentData.application_fee_amount = platformFeeCents(tip.amountCents, tenant.platformFeePercent);
  paymentIntentData.transfer_data = { destination };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: tip.currency,
          unit_amount: tip.amountCents,
          product_data: { name: tip.label },
        },
      },
    ],
    payment_intent_data: paymentIntentData,
    metadata: { kind: "tip", tenantId: tenant.id, tipId: tip.id, userId: user.id },
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return session.url;
}

/** Create a one-time payment Checkout Session for a single gallery media item. */
export async function createMediaItemCheckout(args: {
  tenant: CheckoutTenant;
  item: { id: string; title: string; priceCents: number; currency: string };
  user: CheckoutUser;
  successUrl: string;
  cancelUrl: string;
  consent?: ImmediatePerformanceConsent;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, item, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const metadata = {
    kind: "media-item",
    tenantId: tenant.id,
    mediaItemId: item.id,
    userId: user.id,
    ...(args.consent ? immediatePerformanceConsentMetadata(args.consent) : {}),
  };
  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata,
  };
  paymentIntentData.application_fee_amount = platformFeeCents(item.priceCents, tenant.platformFeePercent);
  paymentIntentData.transfer_data = { destination };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: item.currency,
          unit_amount: item.priceCents,
          product_data: { name: item.title },
        },
      },
    ],
    payment_intent_data: paymentIntentData,
    metadata,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return session.url;
}

/** Create a one-time payment Checkout Session for a pay-per-view post/video. */
export async function createPostCheckout(args: {
  tenant: CheckoutTenant;
  post: { id: string; title: string; priceCents: number; currency: string };
  user: CheckoutUser;
  successUrl: string;
  cancelUrl: string;
  consent?: ImmediatePerformanceConsent;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, post, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const metadata = {
    kind: "post",
    tenantId: tenant.id,
    postId: post.id,
    userId: user.id,
    ...(args.consent ? immediatePerformanceConsentMetadata(args.consent) : {}),
  };
  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata,
  };
  paymentIntentData.application_fee_amount = platformFeeCents(post.priceCents, tenant.platformFeePercent);
  paymentIntentData.transfer_data = { destination };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: post.currency,
          unit_amount: post.priceCents,
          product_data: { name: post.title },
        },
      },
    ],
    payment_intent_data: paymentIntentData,
    metadata,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return session.url;
}

/**
 * Flags a Stripe subscription to end at the current period end.
 * Returns the period-end date when Stripe reports one.
 */
export async function cancelSubscriptionAtPeriodEnd(
  stripeSubscriptionId: string,
): Promise<Date | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const sub = await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  // API-version tolerant: period end lives on the subscription or its items.
  const raw = sub as unknown as {
    current_period_end?: number;
    items?: { data?: { current_period_end?: number }[] };
  };
  const end = raw.current_period_end ?? raw.items?.data?.[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
}

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
): Stripe.Event | null {
  const stripe = getStripe();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return null;
  try {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return null;
  }
}
