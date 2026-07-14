import { NextResponse } from "next/server";
import type Stripe from "stripe";
import prisma, { withTenantContext, withTenantTransaction } from "@/lib/prisma";
import { constructWebhookEvent, getStripe } from "@/lib/stripe";
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
  refundPaidCreditPack,
  updateCreatorSubscription,
} from "@/lib/credits";
import type { CreatorPlan, SubscriptionStatus } from "@/app/generated/prisma/client";

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

  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
  });
  if (existing?.status === "COMPLETED") return "completed";
  if (
    existing?.status === "PROCESSING" &&
    Date.now() - existing.updatedAt.getTime() < EVENT_LEASE_MS
  ) {
    return "processing";
  }
  await prisma.stripeWebhookEvent.update({
    where: { id: event.id },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      lastError: null,
      objectId: metadata.objectId,
      tenantId: metadata.tenantId,
    },
  });
  return "claimed";
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

    if (event.type === "charge.refunded") {
      await handleChargeRefunded(
        event.data.object as Stripe.Charge,
        event.id,
      );
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
      const sub = event.data.object as Stripe.Subscription;
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
        const tenantId = invoice.parent?.subscription_details?.metadata?.tenantId;
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

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id ?? null;
}

async function syncMembershipSubscription(
  stripeSubscriptionId: string,
  status: SubscriptionStatus,
  options: {
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: Date;
    emitCanceled?: boolean;
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

async function handleChargeRefunded(charge: Stripe.Charge, eventId: string): Promise<void> {
  if (!charge.refunded) return;
  const raw = charge as unknown as {
    payment_intent?: string | { id?: string } | null;
    metadata?: Record<string, string>;
  };
  const paymentIntentId =
    typeof raw.payment_intent === "string"
      ? raw.payment_intent
      : raw.payment_intent?.id ?? null;
  if (!paymentIntentId) return;
  await reversePaymentBenefits(
    paymentIntentId,
    eventId,
    raw.metadata?.tenantId,
    "stripe.charge.refunded",
  );
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
    await reversePaymentBenefits(
      paymentIntentId,
      eventId,
      dispute.metadata?.tenantId,
      eventType === "charge.dispute.created" ? "stripe.dispute.created" : "stripe.dispute.lost",
    );
    const stripeSubscriptionId = await subscriptionIdForPaymentIntent(paymentIntentId);
    if (stripeSubscriptionId) {
      await syncMembershipSubscription(stripeSubscriptionId, "PAST_DUE");
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
          const changed = await tx.order.updateMany({
            where: { id: order.id, refundedAt: null },
            data: { status: "REFUNDED", refundedAt: new Date() },
          });
          if (changed.count === 0 || !order.productId) return;
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
  const tenantId = m.tenantId;
  const userId = m.userId;
  if (!tenantId || !userId) return received();

  const tenant = await withTenantContext(tenantId, () =>
    prisma.tenant.findUnique({ where: { id: tenantId } }),
  );
  if (!tenant) return received();

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

    if (m.kind === "ai_credit_pack" && m.packId) {
      await grantPaidCreditPack({
        tenantId,
        userId,
        packId: m.packId,
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
      });
    } else if (m.kind === "creator_plan" && m.plan) {
      const stripeSubscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;
      if (!stripeSubscriptionId) return received();
      await activatePaidCreatorPlan({
        tenantId,
        plan: m.plan as CreatorPlan,
        stripeSubscriptionId,
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : null,
      });
    } else if (m.kind === "tier" && m.tierId) {
      const tier = await prisma.membershipTier.findFirst({
        where: { id: m.tierId, tenantId },
      });
      if (tier) {
        // Persist the membership/subscription once, but always continue with
        // idempotent grants so a retry repairs partially completed fulfillment.
        const priorMembership = await prisma.membership.findUnique({
          where: { tenantId_userId: { tenantId, userId } },
          select: { tierId: true },
        });
        const stripeSubscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;
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
      }
    } else if (m.kind === "product" && m.productId) {
      const product = await prisma.product.findFirst({
        where: { id: m.productId, tenantId },
      });
      if (product) {
        // Core payment record and inventory mutation commit together. On a
        // retry, only the repairable/idempotent follow-up grants run again.
        const existingOrder = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (!existingOrder) {
          const shipping = (session as { shipping_details?: unknown }).shipping_details ?? null;
          const shippingCost = session.shipping_cost?.amount_total ?? 0;
          await withTenantTransaction(async (tx) => {
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
                shippingDetails: shipping ? (shipping as object) : undefined,
                status: "PAID",
                stripeSessionId: session.id,
                stripePaymentIntentId:
                  typeof session.payment_intent === "string" ? session.payment_intent : null,
                grantedEntitlementKey: product.grantsEntitlementKey,
              },
            });
            if (product.stock !== null) {
              await tx.product.updateMany({
                where: { id: product.id, stock: { gt: 0 } },
                data: { stock: { decrement: 1 } },
              });
            }
          });
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
      }
    } else if (m.kind === "media" && m.mediaPackageId) {
      const pkg = await prisma.mediaPackage.findFirst({
        where: { id: m.mediaPackageId, tenantId },
      });
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
      if (reservation) {
        const existingOrder = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        if (!existingOrder) {
          await prisma.order.create({
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
        }
        await prisma.bookingReservation.update({
          where: { id: reservation.id },
          data: { status: "CONFIRMED" },
        });
        await emitWebhookEvent(tenantId, "order.paid", {
          product: `Buchung: ${reservation.slot.title}`,
          amountCents: session.amount_total ?? reservation.slot.priceCents,
          currency: session.currency ?? reservation.slot.currency,
        });
      }
    } else if (m.kind === "tip" && m.tipId) {
      const tip = await prisma.tip.findFirst({ where: { id: m.tipId, tenantId } });
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
    await writeAudit({ tenantId, actorUserId: userId, action: "stripe.checkout.completed" });
    return received();
  });
}
