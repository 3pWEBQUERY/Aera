import { NextResponse } from "next/server";
import type Stripe from "stripe";
import prisma, { withTenantContext, withTenantTransaction } from "@/lib/prisma";
import {
  constructWebhookEvent,
  cancelAndRefundOrphanCreatorSubscription,
  getStripe,
  reverseDestinationTransferForDispute,
  reverseDestinationTransferForRefunds,
} from "@/lib/stripe";
import { grantEntitlement, revokePreviousTierEntitlement } from "@/lib/entitlements";
import { awardPoints, reversePointsByReference } from "@/lib/gamification";
import { platformFeeCents } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import { emitWebhookEvent } from "@/lib/webhooks";
import { recordReferralPurchase, reverseReferralPurchase } from "@/lib/referrals";
import {
  activatePaidCreatorPlan,
  endCreatorSubscription,
  grantPaidCreditPack,
  refillCreatorPlanFromPaidInvoice,
  refundPaidCreditPack,
  updateCreatorSubscription,
} from "@/lib/credits";
import {
  releaseProductOrderReservation,
  settleProductOrderReservation,
} from "@/lib/product-inventory";
import {
  completeTrackedCreatorCheckout,
  failTrackedCreatorCheckout,
} from "@/lib/creator-checkout";
import type {
  CreatorPlan,
  Prisma,
  SubscriptionStatus,
} from "@/app/generated/prisma/client";
import { immediatePerformanceConsentFromMetadata } from "@/lib/legal";

const received = () => NextResponse.json({ received: true });
const EVENT_LEASE_MS = 5 * 60 * 1000;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function stripeEventMetadata(event: Stripe.Event): {
  objectId: string | null;
  tenantId: string | null;
} {
  const object = event.data.object as unknown as {
    id?: string;
    metadata?: Record<string, string>;
    parent?: { subscription_details?: { metadata?: Record<string, string> } };
    subscription_details?: { metadata?: Record<string, string> };
  };
  return {
    objectId: object.id ?? null,
    tenantId:
      object.metadata?.tenantId ??
      object.parent?.subscription_details?.metadata?.tenantId ??
      object.subscription_details?.metadata?.tenantId ??
      null,
  };
}

async function beginStripeEvent(
  event: Stripe.Event,
): Promise<"claimed" | "completed" | "processing"> {
  const metadata = stripeEventMetadata(event);
  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        id: event.id,
        type: event.type,
        objectId: metadata.objectId,
        tenantId: metadata.tenantId,
      },
    });
    return "claimed";
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  // Reclaim in one conditional write. A read-then-update would let concurrent
  // deliveries both execute money mutations after a failed/expired lease.
  const reclaimed = await prisma.stripeWebhookEvent.updateMany({
    where: {
      id: event.id,
      status: { not: "COMPLETED" },
      OR: [
        { status: "FAILED" },
        {
          status: "PROCESSING",
          updatedAt: { lt: new Date(Date.now() - EVENT_LEASE_MS) },
        },
      ],
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      lastError: null,
      objectId: metadata.objectId,
      tenantId: metadata.tenantId,
    },
  });
  if (reclaimed.count === 1) return "claimed";

  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
  });
  return existing?.status === "COMPLETED" ? "completed" : "processing";
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  const event = constructWebhookEvent(body, sig);
  if (!event) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  let claim: "claimed" | "completed" | "processing";
  try {
    claim = await beginStripeEvent(event);
  } catch (error) {
    console.error(`Stripe event inbox failed (${event.type}, ${event.id}):`, error);
    return NextResponse.json({ error: "Webhook inbox failed" }, { status: 500 });
  }
  if (claim === "completed") return received();
  if (claim === "processing") {
    return NextResponse.json({ error: "Webhook already processing" }, { status: 500 });
  }

  // Any thrown error -> 500 so Stripe retries. Handlers below are idempotent,
  // so retried (or duplicate) events become no-ops instead of duplicate rows.
  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const response = await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
      );
      await prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { status: "COMPLETED", processedAt: new Date(), lastError: null },
      });
      return response;
    }

    if (
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "checkout.session.expired"
    ) {
      await handleCheckoutUnavailable(
        event.data.object as Stripe.Checkout.Session,
        event.type,
      );
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const reversal = await reverseDestinationTransferForRefunds(charge);
      await handleChargeRefunded(charge, event.id, reversal);
    }

    if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
      await handleChargeDispute(event.data.object as Stripe.Dispute, event.id, event.type);
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (sub.metadata?.kind === "creator_plan" && tenantId) {
        await withTenantContext(tenantId, () =>
          endCreatorSubscription({
            tenantId,
            stripeSubscriptionId: sub.id,
          }),
        );
      }
      await syncMembershipSubscription(sub.id, "CANCELED", {
        emitCanceled: true,
      });
    }

    if (event.type === "customer.subscription.updated") {
      const delivered = event.data.object as Stripe.Subscription;
      const current = await retrieveCurrentStripeSubscription(delivered.id);
      // Stripe doesn't guarantee webhook ordering. A stale downgrade event may
      // arrive after a later payment recovered the same subscription.
      if (!current) {
        await prisma.stripeWebhookEvent.update({
          where: { id: event.id },
          data: { status: "COMPLETED", processedAt: new Date(), lastError: null },
        });
        return received();
      }
      const sub = current;
      const raw = sub as unknown as {
        current_period_end?: number;
        items?: { data?: { current_period_end?: number }[] };
      };
      const end = raw.current_period_end ?? raw.items?.data?.[0]?.current_period_end;
      const tenantId = sub.metadata?.tenantId;
      if (sub.metadata?.kind === "creator_plan" && tenantId) {
        await withTenantContext(tenantId, () =>
          updateCreatorSubscription({
            tenantId,
            stripeSubscriptionId: sub.id,
            status: creatorSubscriptionStatus(sub.status),
            cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
            currentPeriodEnd: end ? new Date(end * 1000) : null,
          }),
        );
      }
      await syncMembershipSubscription(sub.id, creatorSubscriptionStatus(sub.status), {
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        currentPeriodEnd: end ? new Date(end * 1000) : undefined,
      });
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoiceSubscriptionId(invoice);
      if (subId) {
        const current = await retrieveCurrentStripeSubscription(subId);
        // A delayed failed-attempt event must not erase a later successful
        // payment. Only Stripe's current non-active state can suspend access.
        if (
          !current ||
          current.status === "active" ||
          current.status === "trialing" ||
          current.status === "canceled" ||
          current.status === "incomplete_expired" ||
          current.status === "paused"
        ) {
          await prisma.stripeWebhookEvent.update({
            where: { id: event.id },
            data: { status: "COMPLETED", processedAt: new Date(), lastError: null },
          });
          return received();
        }
        const tenantId = await creatorTenantIdForInvoice(invoice, subId);
        if (tenantId) {
          await withTenantContext(tenantId, () =>
            updateCreatorSubscription({
              tenantId,
              stripeSubscriptionId: subId,
              status: "PAST_DUE",
            }),
          );
        }
        await syncMembershipSubscription(subId, "PAST_DUE");
      }
    }

    if (event.type === "invoice.paid") {
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
    }

    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { status: "COMPLETED", processedAt: new Date(), lastError: null },
    });
    return received();
  } catch (e) {
    console.error(`Stripe webhook failed (${event.type}, ${event.id}):`, e);
    try {
      await prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          lastError: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
        },
      });
    } catch (inboxError) {
      console.error(`Stripe event failure could not be persisted (${event.id}):`, inboxError);
    }
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function handleCheckoutUnavailable(
  session: Stripe.Checkout.Session,
  eventType:
    | "checkout.session.async_payment_failed"
    | "checkout.session.expired",
): Promise<void> {
  const metadata = session.metadata ?? {};
  if (
    metadata.kind === "creator_plan" &&
    metadata.tenantId
  ) {
    await failTrackedCreatorCheckout({
      pendingCreatorCheckoutId: metadata.pendingCreatorCheckoutId,
      tenantId: metadata.tenantId,
      stripeSessionId: session.id,
      status: eventType === "checkout.session.expired" ? "EXPIRED" : "FAILED",
    });
    return;
  }
  if (
    metadata.kind === "booking" &&
    metadata.tenantId &&
    metadata.reservationId
  ) {
    await withTenantContext(metadata.tenantId, () =>
      prisma.bookingReservation.updateMany({
        where: {
          id: metadata.reservationId,
          tenantId: metadata.tenantId,
          status: "PENDING",
          OR: [
            { stripeSessionId: null },
            { stripeSessionId: session.id },
          ],
        },
        data: { status: "CANCELLED", stripeSessionId: session.id },
      }),
    );
    return;
  }
  if (
    metadata.kind !== "product" ||
    !metadata.tenantId ||
    !metadata.orderId
  ) {
    return;
  }
  await withTenantContext(metadata.tenantId, async () => {
    const released = await releaseProductOrderReservation(
      metadata.orderId,
      new Date(),
      session.id,
    );
    if (released) {
      await writeAudit({
        tenantId: metadata.tenantId,
        action: "stripe.product_reservation.released",
        targetType: "Order",
        targetId: metadata.orderId,
        metadata: { stripeSessionId: session.id, reason: eventType },
      });
    }
  });
}

/** A paid Checkout that cannot be fulfilled is refunded, never silently kept. */
async function refundUnfulfillableCheckout(
  session: Stripe.Checkout.Session,
  reason: string,
  tenantId: string | null,
  reverseDestinationTransfer = true,
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  if (!paymentIntentId) {
    throw new Error(`Paid product checkout ${session.id} has no PaymentIntent`);
  }
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is required to refund an unfulfillable checkout");
  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      ...(reverseDestinationTransfer
        ? { reverse_transfer: true, refund_application_fee: true }
        : {}),
      metadata: {
        aeraReason: reason,
        stripeCheckoutSessionId: session.id,
      },
    },
    {
      idempotencyKey: `aera:unfulfillable-${
        session.metadata?.kind ?? "checkout"
      }:${session.id}`,
    },
  );
  await writeAudit({
    tenantId,
    action: "stripe.checkout.auto_refunded",
    targetType: "StripeCheckoutSession",
    targetId: session.id,
    metadata: { paymentIntentId, refundId: refund.id, reason },
  });
}

async function cancelAndRefundUnfulfillableTierCheckout(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  if (!stripeSubscriptionId) {
    throw new Error(`Paid tier checkout ${session.id} has no subscription`);
  }
  await cancelAndRefundOrphanCreatorSubscription({
    stripeSubscriptionId,
    reverseDestinationTransfer: true,
  });
}

const TERMINAL_STRIPE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

async function retrieveCurrentStripeSubscription(
  stripeSubscriptionId: string,
): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is required to verify subscription state");
  try {
    return await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "resource_missing") return null;
    throw error;
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const current = invoice.parent?.subscription_details?.subscription;
  // Keep a compatibility fallback for events pinned to an older Stripe API
  // version while using the v19 parent shape as the primary source.
  const legacy = (invoice as unknown as {
    subscription?: string | { id?: string } | null;
  }).subscription;
  const subscription = current ?? legacy;
  return typeof subscription === "string" ? subscription : subscription?.id ?? null;
}

function invoiceSubscriptionMetadata(invoice: Stripe.Invoice): Record<string, string> {
  return invoice.parent?.subscription_details?.metadata ?? {};
}

async function creatorTenantIdForInvoice(
  invoice: Stripe.Invoice,
  stripeSubscriptionId: string,
): Promise<string | null> {
  const metadata = invoiceSubscriptionMetadata(invoice);
  if (metadata.tenantId) return metadata.tenantId;
  const wallet = await prisma.aiCreditWallet.findUnique({
    where: { stripeSubscriptionId },
    select: { tenantId: true },
  });
  return wallet?.tenantId ?? null;
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const stripeSubscriptionId = invoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;

  const currentSubscription = await retrieveCurrentStripeSubscription(
    stripeSubscriptionId,
  );
  if (
    !currentSubscription ||
    TERMINAL_STRIPE_SUBSCRIPTION_STATUSES.has(currentSubscription.status)
  ) {
    // A delayed paid-invoice delivery must not resurrect a subscription that
    // Stripe has already ended. A genuinely new subscription has a new id.
    return;
  }

  const metadata = invoiceSubscriptionMetadata(invoice);
  const periodStart = new Date(invoice.period_start * 1000);
  const periodEnd = new Date(invoice.period_end * 1000);
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;

  if (metadata.kind === "creator_plan") {
    const tenantId = await creatorTenantIdForInvoice(invoice, stripeSubscriptionId);
    const tenantExists = tenantId
      ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
      : null;
    if (!tenantExists) {
      await cancelAndRefundOrphanCreatorSubscription({
        stripeSubscriptionId,
        stripeInvoiceId: invoice.id,
      });
      return;
    }
    const creatorTenantId = tenantExists.id;
    const refillAllowance =
      invoice.billing_reason === "subscription_create" ||
      invoice.billing_reason === "subscription_cycle";
    if (metadata.plan && refillAllowance) {
      const result = await withTenantContext(creatorTenantId, () =>
        refillCreatorPlanFromPaidInvoice({
          tenantId: creatorTenantId,
          plan: metadata.plan as CreatorPlan,
          stripeSubscriptionId,
          stripeInvoiceId: invoice.id,
          stripeCustomerId: customerId,
          periodStart,
          periodEnd,
        }),
      );
      if (!result.ok) {
        throw new Error(result.error ?? "Creator invoice could not refill credits");
      }
    } else {
      // Proration/manual invoices prove that billing recovered, but they do not
      // grant a second monthly allowance inside the same subscription period.
      await withTenantContext(creatorTenantId, () =>
        updateCreatorSubscription({
          tenantId: creatorTenantId,
          stripeSubscriptionId,
          status: "ACTIVE",
          currentPeriodEnd: periodEnd,
        }),
      );
    }
  }

  // A recovered recurring membership invoice restores tier access. Creator
  // plans have no Membership row, so this is a harmless no-op for them.
  await syncMembershipSubscription(stripeSubscriptionId, "ACTIVE", {
    currentPeriodEnd: periodEnd,
    paidInvoiceRecovery: true,
  });
}

async function syncMembershipSubscription(
  stripeSubscriptionId: string,
  status: SubscriptionStatus,
  options: {
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: Date;
    emitCanceled?: boolean;
    paidInvoiceRecovery?: boolean;
  } = {},
): Promise<void> {
  const ref = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: { tenantId: true },
  });
  if (!ref) return;
  await withTenantContext(ref.tenantId, async () => {
    const local = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      include: { tier: true },
    });
    if (!local) return;
    if (
      status === "ACTIVE" &&
      local.status === "PAST_DUE" &&
      !options.paidInvoiceRecovery
    ) {
      // Only invoice.paid proves that a delinquent/refunded period recovered.
      // A delayed/unrelated subscription.updated(active) must not regrant access.
      return;
    }
    await prisma.subscription.update({
      where: { id: local.id },
      data: {
        status,
        cancelAtPeriodEnd: options.cancelAtPeriodEnd,
        currentPeriodEnd: options.currentPeriodEnd,
      },
    });
    const active = status === "ACTIVE" || status === "TRIALING";
    if (active) {
      await prisma.membership.updateMany({
        where: { tenantId: local.tenantId, userId: local.userId },
        data: { status: "ACTIVE", tierId: local.tierId },
      });
      await grantEntitlement({
        tenantId: local.tenantId,
        userId: local.userId,
        key: local.tier.entitlementKey,
        source: "TIER",
        sourceId: local.tierId,
      });
      return;
    }

    await prisma.entitlement.updateMany({
      where: {
        tenantId: local.tenantId,
        userId: local.userId,
        key: local.tier.entitlementKey,
      },
      data: { expiresAt: new Date() },
    });
    const defaultTier = await prisma.membershipTier.findFirst({
      where: { tenantId: local.tenantId, isDefault: true },
    });
    await prisma.membership.updateMany({
      where: { tenantId: local.tenantId, userId: local.userId },
      data: { tierId: defaultTier?.id ?? null },
    });
    if (options.emitCanceled) {
      await emitWebhookEvent(local.tenantId, "subscription.canceled", {
        subscriptionId: local.id,
        tier: local.tier.slug,
      });
    }
  });
}

async function handleChargeRefunded(
  charge: Stripe.Charge,
  eventId: string,
  reversal: { reversedCents: number; alreadyReversedCents: number },
): Promise<void> {
  const raw = charge as unknown as {
    payment_intent?: string | { id?: string } | null;
    metadata?: Record<string, string>;
  };
  const paymentIntentId =
    typeof raw.payment_intent === "string"
      ? raw.payment_intent
      : raw.payment_intent?.id ?? null;
  if (!paymentIntentId) return;
  const fullyRefunded =
    charge.refunded ||
    (charge.amount > 0 && charge.amount_refunded >= charge.amount);
  if (!fullyRefunded) {
    const tenantId = await tenantIdForPaymentIntent(paymentIntentId, raw.metadata?.tenantId);
    await writeAudit({
      tenantId,
      action: "stripe.charge.partially_refunded",
      targetType: "PaymentIntent",
      targetId: paymentIntentId,
      metadata: {
        stripeChargeId: charge.id,
        stripeEventId: eventId,
        amountCents: charge.amount,
        amountRefundedCents: charge.amount_refunded,
        transferReversedCents: reversal.reversedCents,
        transferAlreadyReversedCents: reversal.alreadyReversedCents,
      },
    });
    return;
  }
  await reversePaymentBenefits(
    paymentIntentId,
    eventId,
    raw.metadata?.tenantId,
    "stripe.charge.refunded",
  );
  await suspendSubscriptionForPaymentIntent(paymentIntentId, eventId);
}

async function tenantIdForPaymentIntent(
  paymentIntentId: string,
  tenantHint?: string,
): Promise<string | null> {
  const [order, creditPurchase] = await Promise.all([
    prisma.order.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { tenantId: true },
    }),
    prisma.aiCreditPurchase.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { tenantId: true },
    }),
  ]);
  return order?.tenantId ?? creditPurchase?.tenantId ?? tenantHint ?? null;
}

async function subscriptionIdForPaymentIntent(paymentIntentId: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const payments = await stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntentId },
    limit: 1,
    expand: ["data.invoice"],
  });
  const invoiceRef = payments.data[0]?.invoice;
  if (!invoiceRef) return null;
  const invoice =
    typeof invoiceRef === "string" ? await stripe.invoices.retrieve(invoiceRef) : invoiceRef;
  return "deleted" in invoice && invoice.deleted ? null : invoiceSubscriptionId(invoice as Stripe.Invoice);
}

async function suspendSubscriptionForPaymentIntent(
  paymentIntentId: string,
  eventId: string,
): Promise<void> {
  const stripeSubscriptionId = await subscriptionIdForPaymentIntent(paymentIntentId);
  if (!stripeSubscriptionId) return;

  const membershipSubscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: { tenantId: true },
  });
  await syncMembershipSubscription(stripeSubscriptionId, "PAST_DUE");
  if (membershipSubscription) {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe is required to reverse subscription benefits");
    const sessions = await stripe.checkout.sessions.list({
      subscription: stripeSubscriptionId,
      limit: 100,
    });
    const checkout = sessions.data.find(
      (candidate) => candidate.metadata?.kind === "tier",
    );
    const checkoutTenantId = checkout?.metadata?.tenantId;
    const checkoutUserId = checkout?.metadata?.userId;
    if (checkout && checkoutTenantId && checkoutUserId) {
      await withTenantContext(checkoutTenantId, async () => {
        await reversePointsByReference({
          tenantId: checkoutTenantId,
          userId: checkoutUserId,
          refType: "StripeSession",
          refId: checkout.id,
          reversalRefId: eventId,
        });
        await reverseReferralPurchase({
          tenantId: checkoutTenantId,
          stripeSessionId: checkout.id,
        });
      });
    }
  }
  const wallet = await prisma.aiCreditWallet.findFirst({
    where: { stripeSubscriptionId },
    select: { tenantId: true },
  });
  if (wallet) {
    await withTenantContext(wallet.tenantId, () =>
      updateCreatorSubscription({
        tenantId: wallet.tenantId,
        stripeSubscriptionId,
        status: "PAST_DUE",
      }),
    );
  }
}

async function handleChargeDispute(
  dispute: Stripe.Dispute,
  eventId: string,
  eventType: "charge.dispute.created" | "charge.dispute.closed",
): Promise<void> {
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id ?? null;
  if (!paymentIntentId) return;

  // Benefits are removed immediately. A won dispute is intentionally not
  // auto-restored: replaying grants after a long dispute window could duplicate
  // inventory or commissions and requires an explicit operator decision.
  if (eventType === "charge.dispute.created" || dispute.status === "lost") {
    await reverseDestinationTransferForDispute(dispute);
    await reversePaymentBenefits(
      paymentIntentId,
      eventId,
      dispute.metadata?.tenantId,
      eventType === "charge.dispute.created" ? "stripe.dispute.created" : "stripe.dispute.lost",
    );
    await suspendSubscriptionForPaymentIntent(paymentIntentId, eventId);
    return;
  }

  await writeAudit({
    tenantId: dispute.metadata?.tenantId ?? null,
    action: "stripe.dispute.won",
    targetType: "PaymentIntent",
    targetId: paymentIntentId,
    metadata: { disputeId: dispute.id, stripeEventId: eventId },
  });
}

async function reversePaymentBenefits(
  paymentIntentId: string,
  eventId: string,
  tenantHint: string | undefined,
  auditAction: string,
): Promise<void> {
  const [orderRef, creditRef] = await Promise.all([
    prisma.order.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { tenantId: true },
    }),
    prisma.aiCreditPurchase.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { tenantId: true },
    }),
  ]);
  const tenantId = orderRef?.tenantId ?? creditRef?.tenantId ?? tenantHint;
  if (!tenantId) return;

  await withTenantContext(tenantId, async () => {
    const order = await prisma.order.findFirst({
      where: { tenantId, stripePaymentIntentId: paymentIntentId },
    });
    if (order) {
      if (!order.refundedAt) {
        await withTenantTransaction(async (tx) => {
          const refundedAt = new Date();
          const changed = await tx.order.updateMany({
            where: { id: order.id, refundedAt: null },
            data: { status: "REFUNDED", refundedAt, inventoryReleasedAt: refundedAt },
          });
          if (
            changed.count === 0 ||
            !order.productId ||
            !order.inventoryReservedAt
          ) {
            return;
          }
          const product = await tx.product.findUnique({
            where: { id: order.productId },
            select: { stock: true },
          });
          if (product?.stock !== null && product?.stock !== undefined) {
            await tx.product.update({
              where: { id: order.productId },
              data: { stock: { increment: 1 } },
            });
          }
        });
      }
      if (order.grantedEntitlementKey) {
        const otherPaidOrders = await prisma.order.count({
          where: {
            id: { not: order.id },
            tenantId,
            userId: order.userId,
            status: "PAID",
            grantedEntitlementKey: order.grantedEntitlementKey,
          },
        });
        if (Number(otherPaidOrders ?? 0) === 0) {
          await prisma.entitlement.deleteMany({
            where: {
              tenantId,
              userId: order.userId,
              key: order.grantedEntitlementKey,
              source: "PURCHASE",
            },
          });
        }
      }
      if (order.stripeSessionId) {
        await reversePointsByReference({
          tenantId,
          userId: order.userId,
          refType: "StripeSession",
          refId: order.stripeSessionId,
          reversalRefId: eventId,
        });
        await reverseReferralPurchase({
          tenantId,
          stripeSessionId: order.stripeSessionId,
        });
        if (order.description === "Trinkgeld") {
          const stripe = getStripe();
          if (!stripe) throw new Error("Stripe is required to reverse checkout benefits");
          const checkout = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
          const tipId = checkout.metadata?.kind === "tip"
            ? checkout.metadata.tipId
            : null;
          if (!tipId) throw new Error(`Tip checkout ${checkout.id} has no tip metadata`);
          await reversePointsByReference({
            tenantId,
            userId: order.userId,
            refType: "Tip",
            refId: tipId,
            reversalRefId: eventId,
          });
          await prisma.tip.updateMany({
            where: {
              id: tipId,
              tenantId,
              status: "PAID",
            },
            data: { status: "REFUNDED" },
          });
        }
      }
    }

    await refundPaidCreditPack({
      tenantId,
      stripePaymentIntentId: paymentIntentId,
    });
    await writeAudit({
      tenantId,
      action: auditAction,
      targetType: order ? "Order" : "AiCreditPurchase",
      targetId: order?.id ?? paymentIntentId,
      metadata: { paymentIntentId, stripeEventId: eventId },
    });
  });
}

function creatorSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    default:
      return "INCOMPLETE";
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const m = session.metadata ?? {};
  const legalConsent = immediatePerformanceConsentFromMetadata(m);
  const tenantId = m.tenantId;
  const userId = m.userId;
  if (!tenantId || !userId) return received();

  const tenant = await withTenantContext(tenantId, () =>
    prisma.tenant.findUnique({ where: { id: tenantId } }),
  );
  if (!tenant) {
    const marketplaceOneTime = new Set([
      "product",
      "media",
      "media-item",
      "post",
      "request",
      "booking",
      "tip",
    ]).has(m.kind ?? "");
    if (session.payment_status === "paid" && marketplaceOneTime) {
      await refundUnfulfillableCheckout(session, "tenant_missing", null);
    } else if (session.payment_status === "paid" && m.kind === "ai_credit_pack") {
      await refundUnfulfillableCheckout(session, "tenant_missing", null, false);
    } else if (m.kind === "tier") {
      await cancelAndRefundUnfulfillableTierCheckout(session);
    } else if (m.kind === "creator_plan") {
      const stripeSubscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;
      if (!stripeSubscriptionId) {
        throw new Error(`Orphan creator checkout ${session.id} has no subscription`);
      }
      await cancelAndRefundOrphanCreatorSubscription({ stripeSubscriptionId });
    }
    return received();
  }

  return withTenantContext(tenantId, async () => {
    const oneTimePurchase =
      m.kind === "product" ||
      m.kind === "media" ||
      m.kind === "media-item" ||
      m.kind === "post" ||
      m.kind === "request" ||
      m.kind === "booking" ||
      m.kind === "tip" ||
      m.kind === "ai_credit_pack";
    if (oneTimePurchase && session.payment_status !== "paid") {
      return received();
    }
    if (m.kind === "tier" && session.payment_status !== "paid") {
      return received();
    }
    if (m.kind === "creator_plan" && !m.plan) {
      const stripeSubscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;
      if (!stripeSubscriptionId) {
        throw new Error(`Creator checkout ${session.id} has no subscription`);
      }
      await cancelAndRefundOrphanCreatorSubscription({ stripeSubscriptionId });
      return received();
    }

    const missingResourceMetadata =
      (m.kind === "ai_credit_pack" && !m.packId) ||
      (m.kind === "tier" && !m.tierId) ||
      (m.kind === "product" && !m.productId) ||
      (m.kind === "media" && !m.mediaPackageId) ||
      (m.kind === "media-item" && !m.mediaItemId) ||
      (m.kind === "post" && !m.postId) ||
      (m.kind === "request" && !m.requestId) ||
      (m.kind === "booking" && !m.reservationId) ||
      (m.kind === "tip" && !m.tipId);
    if (missingResourceMetadata) {
      if (m.kind === "tier") {
        await cancelAndRefundUnfulfillableTierCheckout(session);
      } else {
        await refundUnfulfillableCheckout(
          session,
          "checkout_metadata_incomplete",
          tenantId,
          m.kind !== "ai_credit_pack",
        );
      }
      return received();
    }

    if (m.kind === "ai_credit_pack" && m.packId) {
      const granted = await grantPaidCreditPack({
        tenantId,
        userId,
        packId: m.packId,
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
      });
      if (!granted.ok) {
        await refundUnfulfillableCheckout(
          session,
          "credit_pack_missing",
          tenantId,
          false,
        );
        return received();
      }
    } else if (m.kind === "creator_plan" && m.plan) {
      const stripeSubscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;
      if (!stripeSubscriptionId) return received();
      const activation = await activatePaidCreatorPlan({
        tenantId,
        plan: m.plan as CreatorPlan,
        stripeSubscriptionId,
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : null,
      });
      if (!activation.ok) {
        await cancelAndRefundOrphanCreatorSubscription({ stripeSubscriptionId });
        return received();
      }
      await completeTrackedCreatorCheckout({
        pendingCreatorCheckoutId: m.pendingCreatorCheckoutId,
        tenantId,
        userId,
        plan: m.plan as CreatorPlan,
        stripeSessionId: session.id,
        stripeSubscriptionId,
      });
    } else if (m.kind === "tier" && m.tierId) {
      const stripeSubscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;
      if (!stripeSubscriptionId) {
        throw new Error(`Paid tier checkout ${session.id} has no subscription`);
      }
      const tier = await prisma.membershipTier.findFirst({
        where: { id: m.tierId, tenantId },
      });
      if (!tier) {
        await cancelAndRefundUnfulfillableTierCheckout(session);
        return received();
      }
        // Persist the membership/subscription once, but always continue with
        // idempotent grants so a retry repairs partially completed fulfillment.
        const priorMembership = await prisma.membership.findUnique({
          where: { tenantId_userId: { tenantId, userId } },
          select: { tierId: true },
        });
        const already = stripeSubscriptionId
          ? await prisma.subscription.findUnique({
              where: { stripeSubscriptionId },
              select: { id: true },
            })
          : await prisma.subscription.findFirst({
              where: { tenantId, userId, tierId: tier.id, status: "ACTIVE" },
              select: { id: true },
            });
        if (already) {
          await prisma.membership.upsert({
            where: { tenantId_userId: { tenantId, userId } },
            create: { tenantId, userId, role: "MEMBER", status: "ACTIVE", tierId: tier.id },
            update: { status: "ACTIVE", tierId: tier.id },
          });
        } else {
          await withTenantTransaction(async (tx) => {
            await tx.membership.upsert({
              where: { tenantId_userId: { tenantId, userId } },
              create: { tenantId, userId, role: "MEMBER", status: "ACTIVE", tierId: tier.id },
              update: { status: "ACTIVE", tierId: tier.id },
            });
            await tx.subscription.create({
              data: {
                tenantId,
                userId,
                tierId: tier.id,
                status: "ACTIVE",
                stripeSubscriptionId,
              },
            });
          });
        }
        await grantEntitlement({
          tenantId,
          userId,
          key: tier.entitlementKey,
          source: "TIER",
          sourceId: tier.id,
        });
        // Upgrade from a previous (e.g. free) tier: drop its stale entitlement.
        await revokePreviousTierEntitlement({
          tenantId,
          userId,
          previousTierId: priorMembership?.tierId,
          keepKey: tier.entitlementKey,
        });
        await awardPoints({
          tenantId,
          userId,
          trigger: "PURCHASE",
          refType: "StripeSession",
          refId: session.id,
        });
        await recordReferralPurchase({
          tenantId,
          referredUserId: userId,
          amountCents: session.amount_total ?? tier.priceCents,
          refType: "StripeSession",
          refId: session.id,
        });
        await emitWebhookEvent(tenantId, "subscription.created", {
          tier: tier.slug,
          amountCents: session.amount_total ?? tier.priceCents,
          currency: session.currency ?? tier.currency,
        });
    } else if (m.kind === "product" && m.productId) {
      const product = await prisma.product.findFirst({
        where: { id: m.productId, tenantId },
      });
      if (!product) {
        await refundUnfulfillableCheckout(session, "product_missing", tenantId);
        return received();
      }

      const shipping = (session as { shipping_details?: unknown }).shipping_details ?? null;
      const shippingCost = session.shipping_cost?.amount_total ?? 0;
      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : null;

      if (m.orderId) {
        const settlement = await settleProductOrderReservation({
          orderId: m.orderId,
          tenantId,
          userId,
          productId: product.id,
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          amountCents: session.amount_total ?? product.priceCents,
          currency: session.currency ?? product.currency,
          shippingCents: shippingCost,
          shippingDetails: shipping ? (shipping as Prisma.InputJsonValue) : undefined,
        });
        if (settlement === "unavailable") {
          await refundUnfulfillableCheckout(
            session,
            "inventory_reservation_unavailable",
            tenantId,
          );
          return received();
        }
      } else {
        // Backwards compatibility for Checkout Sessions created before stock
        // reservation deployment. Never create a paid order if the atomic
        // inventory claim failed; refund the payment instead.
        const existingOrder = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (!existingOrder) {
          const legacyFulfilled = await withTenantTransaction(async (tx) => {
            if (product.stock !== null) {
              const claimed = await tx.product.updateMany({
                where: { id: product.id, stock: { gt: 0 } },
                data: { stock: { decrement: 1 } },
              });
              if (claimed.count === 0) return false;
            }
            await tx.order.create({
              data: {
                tenantId,
                userId,
                productId: product.id,
                description: product.name,
                amountCents: session.amount_total ?? product.priceCents,
                currency: session.currency ?? product.currency,
                platformFeeCents: platformFeeCents(product.priceCents, tenant.platformFeePercent),
                shippingCents: shippingCost,
                shippingDetails: shipping ? (shipping as Prisma.InputJsonValue) : undefined,
                status: "PAID",
                stripeSessionId: session.id,
                stripePaymentIntentId: paymentIntentId,
                grantedEntitlementKey: product.grantsEntitlementKey,
                inventoryReservedAt: product.stock !== null ? new Date() : null,
              },
            });
            return true;
          });
          if (!legacyFulfilled) {
            await refundUnfulfillableCheckout(
              session,
              "legacy_inventory_unavailable",
              tenantId,
            );
            return received();
          }
        }
      }

        if (product.grantsEntitlementKey) {
          await grantEntitlement({
            tenantId,
            userId,
            key: product.grantsEntitlementKey,
            source: "PURCHASE",
            sourceId: product.id,
          });
        }
        await awardPoints({
          tenantId,
          userId,
          trigger: "PURCHASE",
          refType: "StripeSession",
          refId: session.id,
        });
        await recordReferralPurchase({
          tenantId,
          referredUserId: userId,
          amountCents: session.amount_total ?? product.priceCents,
          refType: "StripeSession",
          refId: session.id,
        });
        await emitWebhookEvent(tenantId, "order.paid", {
          product: product.name,
          amountCents: session.amount_total ?? product.priceCents,
          currency: session.currency ?? product.currency,
        });
    } else if (m.kind === "media" && m.mediaPackageId) {
      const pkg = await prisma.mediaPackage.findFirst({
        where: { id: m.mediaPackageId, tenantId },
      });
      if (!pkg) {
        await refundUnfulfillableCheckout(session, "media_package_missing", tenantId);
        return received();
      }
      if (pkg) {
        const existingOrder = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (!existingOrder) {
          await prisma.order.create({
            data: {
              tenantId,
              userId,
              description: `Medien: ${pkg.title}`,
              amountCents: session.amount_total ?? pkg.priceCents,
              currency: session.currency ?? pkg.currency,
              platformFeeCents: platformFeeCents(pkg.priceCents, tenant.platformFeePercent),
              status: "PAID",
              stripeSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === "string" ? session.payment_intent : null,
              grantedEntitlementKey: pkg.entitlementKey,
            },
          });
        }
        await grantEntitlement({
          tenantId,
          userId,
          key: pkg.entitlementKey,
          source: "PURCHASE",
          sourceId: pkg.id,
        });
        await awardPoints({
          tenantId,
          userId,
          trigger: "PURCHASE",
          refType: "StripeSession",
          refId: session.id,
        });
        await recordReferralPurchase({
          tenantId,
          referredUserId: userId,
          amountCents: session.amount_total ?? pkg.priceCents,
          refType: "StripeSession",
          refId: session.id,
        });
        await emitWebhookEvent(tenantId, "order.paid", {
          product: `Medien: ${pkg.title}`,
          amountCents: session.amount_total ?? pkg.priceCents,
          currency: session.currency ?? pkg.currency,
        });
      }
    } else if (m.kind === "media-item" && m.mediaItemId) {
      const item = await prisma.mediaItem.findFirst({
        where: { id: m.mediaItemId, tenantId },
        include: { package: { select: { title: true, currency: true } } },
      });
      if (!item) {
        await refundUnfulfillableCheckout(session, "media_item_missing", tenantId);
        return received();
      }
      if (item) {
        const key = item.entitlementKey ?? `media-item:${item.id}`;
        const existingOrder = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (!existingOrder) {
          await prisma.order.create({
            data: {
              tenantId,
              userId,
              description: `Medium: ${item.package.title}`,
              amountCents: session.amount_total ?? item.priceCents,
              currency: session.currency ?? item.package.currency,
              platformFeeCents: platformFeeCents(item.priceCents, tenant.platformFeePercent),
              status: "PAID",
              stripeSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === "string" ? session.payment_intent : null,
              grantedEntitlementKey: key,
            },
          });
        }
        await grantEntitlement({ tenantId, userId, key, source: "PURCHASE", sourceId: item.id });
        await awardPoints({
          tenantId,
          userId,
          trigger: "PURCHASE",
          refType: "StripeSession",
          refId: session.id,
        });
        await recordReferralPurchase({
          tenantId,
          referredUserId: userId,
          amountCents: session.amount_total ?? item.priceCents,
          refType: "StripeSession",
          refId: session.id,
        });
        await emitWebhookEvent(tenantId, "order.paid", {
          product: `Medium: ${item.package.title}`,
          amountCents: session.amount_total ?? item.priceCents,
          currency: session.currency ?? item.package.currency,
        });
      }
    } else if (m.kind === "post" && m.postId) {
      const post = await prisma.post.findFirst({
        where: { id: m.postId, tenantId },
        select: { id: true, title: true, priceCents: true, currency: true, entitlementKey: true },
      });
      if (!post?.entitlementKey) {
        await refundUnfulfillableCheckout(session, "post_missing", tenantId);
        return received();
      }
      if (post && post.entitlementKey) {
        const existingOrder = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (!existingOrder) {
          await prisma.order.create({
            data: {
              tenantId,
              userId,
              description: `Beitrag: ${post.title ?? post.id}`,
              amountCents: session.amount_total ?? post.priceCents,
              currency: session.currency ?? post.currency,
              platformFeeCents: platformFeeCents(post.priceCents, tenant.platformFeePercent),
              status: "PAID",
              stripeSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === "string" ? session.payment_intent : null,
              grantedEntitlementKey: post.entitlementKey,
            },
          });
        }
        await grantEntitlement({
          tenantId,
          userId,
          key: post.entitlementKey,
          source: "PURCHASE",
          sourceId: post.id,
        });
        await awardPoints({
          tenantId,
          userId,
          trigger: "PURCHASE",
          refType: "StripeSession",
          refId: session.id,
        });
        await recordReferralPurchase({
          tenantId,
          referredUserId: userId,
          amountCents: session.amount_total ?? post.priceCents,
          refType: "StripeSession",
          refId: session.id,
        });
        await emitWebhookEvent(tenantId, "order.paid", {
          product: `Beitrag: ${post.title ?? post.id}`,
          amountCents: session.amount_total ?? post.priceCents,
          currency: session.currency ?? post.currency,
        });
      }
    } else if (m.kind === "request" && m.requestId) {
      const req = await prisma.memberRequest.findFirst({
        where: { id: m.requestId, tenantId },
      });
      if (!req) {
        await refundUnfulfillableCheckout(session, "request_missing", tenantId);
        return received();
      }
      if (req.status !== "PRICED") {
        const fulfilledByThisSession = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (req.status !== "FULFILLED" || !fulfilledByThisSession) {
          await refundUnfulfillableCheckout(
            session,
            "request_no_longer_payable",
            tenantId,
          );
          return received();
        }
      }
      if (req) {
        const key = req.entitlementKey ?? `request:${req.id}`;
        const existingOrder = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (!existingOrder) {
          await prisma.order.create({
            data: {
              tenantId,
              userId,
              description: `Anfrage: ${req.title}`,
              amountCents: session.amount_total ?? req.priceCents,
              currency: session.currency ?? req.currency,
              platformFeeCents: platformFeeCents(req.priceCents, tenant.platformFeePercent),
              status: "PAID",
              stripeSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === "string" ? session.payment_intent : null,
              grantedEntitlementKey: key,
            },
          });
        }
        await grantEntitlement({ tenantId, userId, key, source: "PURCHASE", sourceId: req.id });
        await prisma.memberRequest.update({
          where: { id: req.id },
          data: { status: "FULFILLED", entitlementKey: key },
        });
        await emitWebhookEvent(tenantId, "order.paid", {
          product: `Anfrage: ${req.title}`,
          amountCents: session.amount_total ?? req.priceCents,
          currency: session.currency ?? req.currency,
        });
      }
    } else if (m.kind === "booking" && m.reservationId) {
      const reservation = await prisma.bookingReservation.findFirst({
        where: { id: m.reservationId, tenantId },
        include: { slot: true },
      });
      if (!reservation) {
        await refundUnfulfillableCheckout(session, "booking_missing", tenantId);
        return received();
      }
      if (
        reservation.stripeSessionId &&
        reservation.stripeSessionId !== session.id
      ) {
        await refundUnfulfillableCheckout(
          session,
          "booking_session_mismatch",
          tenantId,
        );
        return received();
      }
      const bookingSettlement = await withTenantTransaction(async (tx) => {
        const existingOrder = await tx.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (existingOrder) return "settled" as const;
        const claimed = await tx.bookingReservation.updateMany({
          where: {
            id: reservation.id,
            status: "PENDING",
            OR: [
              { stripeSessionId: null },
              { stripeSessionId: session.id },
            ],
          },
          data: { status: "CONFIRMED", stripeSessionId: session.id },
        });
        if (claimed.count === 0) {
          // A concurrent delivery of the same signed Session may have won the
          // reservation CAS while this transaction waited on the row lock.
          const winner = await tx.order.findUnique({
            where: { stripeSessionId: session.id },
            select: { id: true },
          });
          return winner ? "settled" as const : "unavailable" as const;
        }
        await tx.order.create({
            data: {
              tenantId,
              userId,
              description: `Buchung: ${reservation.slot.title}`,
              amountCents: session.amount_total ?? reservation.slot.priceCents,
              currency: session.currency ?? reservation.slot.currency,
              platformFeeCents: platformFeeCents(reservation.slot.priceCents, tenant.platformFeePercent),
              status: "PAID",
              stripeSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === "string" ? session.payment_intent : null,
            },
          });
        return "settled" as const;
      });
      if (bookingSettlement === "unavailable") {
        await refundUnfulfillableCheckout(
          session,
          "booking_no_longer_available",
          tenantId,
        );
        return received();
      }
      await emitWebhookEvent(tenantId, "order.paid", {
        product: `Buchung: ${reservation.slot.title}`,
        amountCents: session.amount_total ?? reservation.slot.priceCents,
        currency: session.currency ?? reservation.slot.currency,
      });
    } else if (m.kind === "tip" && m.tipId) {
      const tip = await prisma.tip.findFirst({ where: { id: m.tipId, tenantId } });
      if (!tip) {
        await refundUnfulfillableCheckout(session, "tip_missing", tenantId);
        return received();
      }
      if (tip.status !== "PENDING") {
        const fulfilledByThisSession = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (tip.status !== "PAID" || !fulfilledByThisSession) {
          await refundUnfulfillableCheckout(
            session,
            "tip_no_longer_payable",
            tenantId,
          );
          return received();
        }
      }
      if (tip && tip.status !== "PAID") {
        const existingOrder = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (!existingOrder) {
          await prisma.order.create({
            data: {
              tenantId,
              userId,
              description: "Trinkgeld",
              amountCents: session.amount_total ?? tip.amountCents,
              currency: session.currency ?? tip.currency,
              platformFeeCents: platformFeeCents(tip.amountCents, tenant.platformFeePercent),
              status: "PAID",
              stripeSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === "string" ? session.payment_intent : null,
            },
          });
        }
        await prisma.tip.update({ where: { id: tip.id }, data: { status: "PAID" } });
        await awardPoints({
          tenantId,
          userId,
          trigger: "TIP",
          refType: "Tip",
          refId: tip.id,
        }).catch(() => undefined);
        await emitWebhookEvent(tenantId, "order.paid", {
          product: "Trinkgeld",
          amountCents: session.amount_total ?? tip.amountCents,
          currency: session.currency ?? tip.currency,
        });
      }
    }
    if (legalConsent) {
      const evidence = {
        immediatePerformanceConsentedAt: legalConsent.consentedAt,
        withdrawalLossAcknowledgedAt: legalConsent.consentedAt,
        legalTermsVersion: legalConsent.termsVersion,
      };
      if (m.kind === "tier") {
        const stripeSubscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (stripeSubscriptionId) {
          await prisma.subscription.updateMany({
            where: { tenantId, stripeSubscriptionId },
            data: evidence,
          });
        }
      } else if (
        m.kind === "product" ||
        m.kind === "media" ||
        m.kind === "media-item" ||
        m.kind === "post"
      ) {
        await prisma.order.updateMany({
          where: {
            tenantId,
            OR: [
              { stripeSessionId: session.id },
              ...(m.orderId ? [{ id: m.orderId }] : []),
            ],
          },
          data: evidence,
        });
      }
    }
    await writeAudit({ tenantId, actorUserId: userId, action: "stripe.checkout.completed" });
    return received();
  });
}
