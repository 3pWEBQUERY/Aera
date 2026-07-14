import "server-only";
import Stripe from "stripe";
import { env, features } from "./env";

let _stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (!features.stripe) return null;
  if (!_stripe) _stripe = new Stripe(env.STRIPE_SECRET_KEY);
  return _stripe;
}

export function platformFeeCents(amountCents: number, feePercent: number): number {
  return Math.round((amountCents * feePercent) / 100);
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
  if (!tenant.stripeAccountId) return null;
  const status = await getConnectStatus(tenant.stripeAccountId);
  if (!status?.chargesEnabled || !status.payoutsEnabled || !status.detailsSubmitted) return null;
  return tenant.stripeAccountId;
}

interface CreatorBillingTenant {
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
          currency: "eur",
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

/** Create a platform-owned monthly subscription for a creator AI plan. */
export async function createCreatorPlanCheckout(args: {
  tenant: CreatorBillingTenant;
  plan: { key: string; name: string; monthlyCredits: number; priceCents: number };
  user: CheckoutUser;
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, plan, user } = args;
  const metadata = {
    kind: "creator_plan",
    tenantId: tenant.id,
    userId: user.id,
    plan: plan.key,
  };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(args.stripeCustomerId
      ? { customer: args.stripeCustomerId }
      : { customer_email: user.email }),
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
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
  });
  return session.url;
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
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, tier, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;
  const interval = tier.interval === "YEAR" ? "year" : "month";

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
    {
      metadata: { tenantId: tenant.id, tierId: tier.id, userId: user.id },
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
    },
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return session.url;
}

/** Create a one-time payment Checkout Session for a product. */
export async function createProductCheckout(args: {
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
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, product, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData =
    { metadata: { kind: "product", tenantId: tenant.id, productId: product.id, userId: user.id } };
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
    metadata: {
      kind: "product",
      tenantId: tenant.id,
      productId: product.id,
      userId: user.id,
    },
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  };

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

  const session = await stripe.checkout.sessions.create(params);
  return session.url;
}

/** Create a one-time payment Checkout Session for a media package. */
export async function createMediaCheckout(args: {
  tenant: CheckoutTenant;
  pkg: { id: string; title: string; priceCents: number; currency: string };
  user: CheckoutUser;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, pkg, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata: { kind: "media", tenantId: tenant.id, mediaPackageId: pkg.id, userId: user.id },
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
    metadata: { kind: "media", tenantId: tenant.id, mediaPackageId: pkg.id, userId: user.id },
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
}): Promise<string | null> {
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

  const session = await stripe.checkout.sessions.create({
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
  });
  return session.url;
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
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, item, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata: { kind: "media-item", tenantId: tenant.id, mediaItemId: item.id, userId: user.id },
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
    metadata: { kind: "media-item", tenantId: tenant.id, mediaItemId: item.id, userId: user.id },
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
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const { tenant, post, user } = args;
  const destination = await readyConnectDestination(tenant);
  if (!destination) return null;

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata: { kind: "post", tenantId: tenant.id, postId: post.id, userId: user.id },
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
    metadata: { kind: "post", tenantId: tenant.id, postId: post.id, userId: user.id },
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
