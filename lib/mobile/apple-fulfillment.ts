import "server-only";
import prisma, { withTenantContext, withTenantTransaction } from "@/lib/prisma";
import { grantEntitlement, revokePreviousTierEntitlement } from "@/lib/entitlements";
import { awardPoints, reversePointsByReference } from "@/lib/gamification";
import { platformFeeCents } from "@/lib/stripe";
import { recordReferralPurchase } from "@/lib/referrals";
import { emitWebhookEvent } from "@/lib/webhooks";
import { writeAudit } from "@/lib/audit";
import {
  parseTipAppleProductId,
  productAppleProductId,
  tierAppleProductId,
  unlockAppleProductId,
} from "@/lib/apple-products";
import type { JWSTransactionDecodedPayload } from "@/lib/apple-iap";
import type { SubscriptionStatus, Tenant } from "@/app/generated/prisma/client";

/**
 * Apple-IAP-Fulfillment. Die Effekte sind bewusst identisch zum
 * Stripe-Webhook-Pfad (app/api/stripe/webhook/route.ts, handleCheckoutCompleted /
 * syncMembershipSubscription / handleChargeRefunded) und idempotent über
 * `Order.appleTransactionId` bzw. `Subscription.appleOriginalTransactionId`.
 * Alle Funktionen erwarten einen aktiven Tenant-Kontext (RLS).
 */

export type IapKind =
  | "tier"
  | "product"
  | "post"
  | "media"
  | "media-item"
  | "tip"
  | "request"
  | "booking";

export class IapFulfillmentError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "iap_product_mismatch"
      | "physical_not_supported"
      | "iap_invalid",
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "IapFulfillmentError";
  }
}

function txDate(ms: number | undefined): Date | null {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms) : null;
}

// ---------------------------------------------------------------- Tier (Abo)
/** Membership ACTIVE + Subscription + Entitlement + Punkte + Referral — wie Stripe-`tier`. */
export async function fulfillTierPurchase(input: {
  tenant: Tenant;
  userId: string;
  tierId: string;
  txn: JWSTransactionDecodedPayload;
}): Promise<void> {
  const { tenant, userId, txn } = input;
  const tier = await prisma.membershipTier.findFirst({
    where: { id: input.tierId, tenantId: tenant.id },
  });
  if (!tier) throw new IapFulfillmentError("not_found", "Tier not found.", 404);
  if (tier.priceCents <= 0 || tier.interval === "FREE") {
    throw new IapFulfillmentError("iap_product_mismatch", "Free tiers are not purchasable via IAP.");
  }
  const expected = tierAppleProductId(tier);
  if (!expected || expected !== txn.productId) {
    throw new IapFulfillmentError(
      "iap_product_mismatch",
      `Apple product "${txn.productId}" does not match tier "${tier.slug}".`,
    );
  }

  const currentPeriodEnd = txDate(txn.expiresDate);
  const priorMembership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
    select: { tierId: true, status: true },
  });
  if (priorMembership?.status === "BANNED") {
    throw new IapFulfillmentError("iap_invalid", "Banned members cannot re-join via purchase.", 403);
  }

  const existing = await prisma.subscription.findUnique({
    where: { appleOriginalTransactionId: txn.originalTransactionId },
    select: { id: true, tenantId: true, userId: true },
  });
  if (existing && (existing.tenantId !== tenant.id || existing.userId !== userId)) {
    // Dieselbe Apple-Transaktion kann nie zwei Konten/Communities gehören.
    throw new IapFulfillmentError("iap_invalid", "Transaction already redeemed by another account.", 409);
  }

  if (existing) {
    // Idempotenter Retry: Status/Periodenende auffrischen, Grants reparieren.
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        tierId: tier.id,
        cancelAtPeriodEnd: false,
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
      },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
      create: { tenantId: tenant.id, userId, role: "MEMBER", status: "ACTIVE", tierId: tier.id },
      update: { status: "ACTIVE", tierId: tier.id },
    });
  } else {
    await withTenantTransaction(async (tx) => {
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId } },
        create: { tenantId: tenant.id, userId, role: "MEMBER", status: "ACTIVE", tierId: tier.id },
        update: { status: "ACTIVE", tierId: tier.id },
      });
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          userId,
          tierId: tier.id,
          status: "ACTIVE",
          appleOriginalTransactionId: txn.originalTransactionId,
          currentPeriodEnd,
        },
      });
    });
  }

  await grantEntitlement({
    tenantId: tenant.id,
    userId,
    key: tier.entitlementKey,
    source: "TIER",
    sourceId: tier.id,
  });
  await revokePreviousTierEntitlement({
    tenantId: tenant.id,
    userId,
    previousTierId: priorMembership?.tierId,
    keepKey: tier.entitlementKey,
  });
  await awardPoints({
    tenantId: tenant.id,
    userId,
    trigger: "PURCHASE",
    refType: "AppleTransaction",
    refId: txn.originalTransactionId,
  });
  await recordReferralPurchase({
    tenantId: tenant.id,
    referredUserId: userId,
    amountCents: tier.priceCents,
    refType: "AppleTransaction",
    refId: txn.originalTransactionId,
  });
  await emitWebhookEvent(tenant.id, "subscription.created", {
    tier: tier.slug,
    amountCents: tier.priceCents,
    currency: tier.currency,
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: userId,
    action: "apple.iap.tier",
    targetType: "MembershipTier",
    targetId: tier.id,
    metadata: { transactionId: txn.transactionId, productId: txn.productId },
  });
}

// ---------------------------------------------------------------- One-Time
interface OneTimeTarget {
  description: string;
  amountCents: number;
  currency: string;
  productId?: string | null;
  entitlementKey?: string | null;
  entitlementSourceId?: string;
  /** Typspezifische Nacharbeit (Request→FULFILLED, Booking→CONFIRMED, …). */
  afterOrder?: () => Promise<void>;
  webhookProduct: string;
  awardTrigger?: "PURCHASE" | "TIP";
}

/** Kind-spezifische Auflösung inkl. Preis-/Produkt-Prüfung gegen die Apple-Produkt-ID. */
async function resolveOneTimeTarget(input: {
  tenant: Tenant;
  userId: string;
  kind: Exclude<IapKind, "tier">;
  refId: string;
  txn: JWSTransactionDecodedPayload;
}): Promise<OneTimeTarget> {
  const { tenant, userId, kind, refId, txn } = input;

  const requirePoolMatch = (priceCents: number, what: string) => {
    const expected = unlockAppleProductId(priceCents);
    if (!expected || expected !== txn.productId) {
      throw new IapFulfillmentError(
        "iap_product_mismatch",
        `Apple product "${txn.productId}" does not match ${what} (${priceCents} cents).`,
      );
    }
  };

  switch (kind) {
    case "product": {
      const product = await prisma.product.findFirst({
        where: { id: refId, tenantId: tenant.id, isPublished: true },
      });
      if (!product) throw new IapFulfillmentError("not_found", "Product not found.", 404);
      if (product.type === "PHYSICAL") {
        throw new IapFulfillmentError(
          "physical_not_supported",
          "Physical products cannot be purchased via IAP.",
        );
      }
      const expected = productAppleProductId(product);
      if (!expected || expected !== txn.productId) {
        throw new IapFulfillmentError(
          "iap_product_mismatch",
          `Apple product "${txn.productId}" does not match product "${product.slug}".`,
        );
      }
      return {
        description: product.name,
        amountCents: product.priceCents,
        currency: product.currency,
        productId: product.id,
        entitlementKey: product.grantsEntitlementKey,
        entitlementSourceId: product.id,
        webhookProduct: product.name,
        awardTrigger: "PURCHASE",
        afterOrder: async () => {
          if (product.stock !== null) {
            await prisma.product.updateMany({
              where: { id: product.id, tenantId: tenant.id, stock: { gt: 0 } },
              data: { stock: { decrement: 1 } },
            });
          }
        },
      };
    }

    case "post": {
      const post = await prisma.post.findFirst({
        where: { id: refId, tenantId: tenant.id, isPublished: true },
        select: { id: true, title: true, priceCents: true, currency: true, entitlementKey: true },
      });
      if (!post || !post.entitlementKey || post.priceCents <= 0) {
        throw new IapFulfillmentError("not_found", "Paid post not found.", 404);
      }
      requirePoolMatch(post.priceCents, "post price");
      return {
        description: `Beitrag: ${post.title ?? post.id}`,
        amountCents: post.priceCents,
        currency: post.currency,
        entitlementKey: post.entitlementKey,
        entitlementSourceId: post.id,
        webhookProduct: `Beitrag: ${post.title ?? post.id}`,
        awardTrigger: "PURCHASE",
      };
    }

    case "media": {
      const pkg = await prisma.mediaPackage.findFirst({
        where: { id: refId, tenantId: tenant.id, isPublished: true },
      });
      if (!pkg || pkg.priceCents <= 0) {
        throw new IapFulfillmentError("not_found", "Media package not found.", 404);
      }
      requirePoolMatch(pkg.priceCents, "media package price");
      return {
        description: `Medien: ${pkg.title}`,
        amountCents: pkg.priceCents,
        currency: pkg.currency,
        entitlementKey: pkg.entitlementKey,
        entitlementSourceId: pkg.id,
        webhookProduct: `Medien: ${pkg.title}`,
        awardTrigger: "PURCHASE",
      };
    }

    case "media-item": {
      const item = await prisma.mediaItem.findFirst({
        where: { id: refId, tenantId: tenant.id },
        include: { package: { select: { title: true, currency: true } } },
      });
      if (!item || item.priceCents <= 0) {
        throw new IapFulfillmentError("not_found", "Media item not found.", 404);
      }
      requirePoolMatch(item.priceCents, "media item price");
      const key = item.entitlementKey ?? `media-item:${item.id}`;
      return {
        description: `Medium: ${item.package.title}`,
        amountCents: item.priceCents,
        currency: item.package.currency || "eur",
        entitlementKey: key,
        entitlementSourceId: item.id,
        webhookProduct: `Medium: ${item.package.title}`,
        awardTrigger: "PURCHASE",
      };
    }

    case "request": {
      const req = await prisma.memberRequest.findFirst({
        where: { id: refId, tenantId: tenant.id },
      });
      if (!req || req.priceCents <= 0) {
        throw new IapFulfillmentError("not_found", "Priced request not found.", 404);
      }
      requirePoolMatch(req.priceCents, "request price");
      const key = req.entitlementKey ?? `request:${req.id}`;
      return {
        description: `Anfrage: ${req.title}`,
        amountCents: req.priceCents,
        currency: req.currency,
        entitlementKey: key,
        entitlementSourceId: req.id,
        webhookProduct: `Anfrage: ${req.title}`,
        afterOrder: async () => {
          await prisma.memberRequest.update({
            where: { id: req.id },
            data: { status: "FULFILLED", entitlementKey: key },
          });
        },
      };
    }

    case "booking": {
      const slot = await prisma.bookingSlot.findFirst({
        where: { id: refId, tenantId: tenant.id, isPublished: true },
      });
      if (!slot || slot.priceCents <= 0) {
        throw new IapFulfillmentError("not_found", "Paid booking slot not found.", 404);
      }
      requirePoolMatch(slot.priceCents, "booking slot price");
      return {
        description: `Buchung: ${slot.title}`,
        amountCents: slot.priceCents,
        currency: slot.currency,
        webhookProduct: `Buchung: ${slot.title}`,
        afterOrder: async () => {
          // Bestehende (PENDING) Reservierung bestätigen, sonst neu anlegen —
          // die Zahlung ist bereits erfolgt (wie der Stripe-`booking`-Pfad).
          const mine = await prisma.bookingReservation.findFirst({
            where: { slotId: slot.id, userId, status: { in: ["CONFIRMED", "PENDING"] } },
          });
          if (mine) {
            if (mine.status !== "CONFIRMED") {
              await prisma.bookingReservation.update({
                where: { id: mine.id },
                data: { status: "CONFIRMED" },
              });
            }
          } else {
            await prisma.bookingReservation.create({
              data: { tenantId: tenant.id, slotId: slot.id, userId, status: "CONFIRMED" },
            });
          }
        },
      };
    }

    case "tip": {
      // refId = TIPS-Space (ID oder Slug); Betrag kommt aus dem Pool-Produkt.
      const space = await prisma.space.findFirst({
        where: {
          tenantId: tenant.id,
          type: "TIPS",
          OR: [{ id: refId }, { slug: refId }],
        },
      });
      if (!space) throw new IapFulfillmentError("not_found", "Tips space not found.", 404);
      const amountCents = parseTipAppleProductId(txn.productId);
      if (!amountCents) {
        throw new IapFulfillmentError(
          "iap_product_mismatch",
          `Apple product "${txn.productId}" is not a valid tip product.`,
        );
      }
      return {
        description: "Trinkgeld",
        amountCents,
        currency: "eur",
        webhookProduct: "Trinkgeld",
        awardTrigger: "TIP",
        afterOrder: async () => {
          await prisma.tip.create({
            data: {
              tenantId: tenant.id,
              spaceId: space.id,
              userId,
              amountCents,
              currency: "eur",
              isPublic: true,
              status: "PAID",
            },
          });
        },
      };
    }
  }
}

/**
 * One-Time-Kauf (product/post/media/media-item/request/booking/tip):
 * Order(PAID, appleTransactionId) + grantEntitlement(PURCHASE) + typ-
 * spezifische Effekte — identisch zum Stripe-Checkout-Fulfillment,
 * idempotent über die eindeutige transactionId.
 */
export async function fulfillOneTimePurchase(input: {
  tenant: Tenant;
  userId: string;
  kind: Exclude<IapKind, "tier">;
  refId: string;
  txn: JWSTransactionDecodedPayload;
}): Promise<void> {
  const { tenant, userId, kind, txn } = input;
  const target = await resolveOneTimeTarget(input);

  const existingOrder = await prisma.order.findUnique({
    where: { appleTransactionId: txn.transactionId },
    select: { id: true, tenantId: true, userId: true },
  });
  if (existingOrder && (existingOrder.tenantId !== tenant.id || existingOrder.userId !== userId)) {
    throw new IapFulfillmentError("iap_invalid", "Transaction already redeemed by another account.", 409);
  }

  const firstFulfillment = !existingOrder;
  if (firstFulfillment) {
    await prisma.order.create({
      data: {
        tenantId: tenant.id,
        userId,
        productId: target.productId ?? null,
        description: target.description,
        amountCents: target.amountCents,
        currency: target.currency,
        platformFeeCents: platformFeeCents(target.amountCents, tenant.platformFeePercent),
        status: "PAID",
        appleTransactionId: txn.transactionId,
        grantedEntitlementKey: target.entitlementKey ?? null,
      },
    });
    // Typspezifische Effekte nur beim ersten Fulfillment (Tip/Restbestand
    // dürfen bei Retries nicht doppelt gebucht werden). Alles Weitere unten
    // ist upsert-/dedupe-basiert und repariert Teilzustände.
    await target.afterOrder?.();
  }

  if (target.entitlementKey) {
    await grantEntitlement({
      tenantId: tenant.id,
      userId,
      key: target.entitlementKey,
      source: "PURCHASE",
      sourceId: target.entitlementSourceId,
    });
  }
  if (target.awardTrigger) {
    await awardPoints({
      tenantId: tenant.id,
      userId,
      trigger: target.awardTrigger,
      refType: "AppleTransaction",
      refId: txn.transactionId,
    }).catch(() => undefined);
  }
  await recordReferralPurchase({
    tenantId: tenant.id,
    referredUserId: userId,
    amountCents: target.amountCents,
    refType: "AppleTransaction",
    refId: txn.transactionId,
  });
  if (firstFulfillment) {
    await emitWebhookEvent(tenant.id, "order.paid", {
      product: target.webhookProduct,
      amountCents: target.amountCents,
      currency: target.currency,
    });
  }
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: userId,
    action: `apple.iap.${kind}`,
    targetType: "Order",
    targetId: txn.transactionId,
    metadata: { productId: txn.productId, refId: input.refId },
  });
}

// ---------------------------------------------------------------- Notification-Sync
/**
 * Status-Sync für Apple-Abos — Spiegel von syncMembershipSubscription im
 * Stripe-Webhook (customer.subscription.updated/deleted).
 */
export async function syncAppleSubscription(
  appleOriginalTransactionId: string,
  status: SubscriptionStatus,
  options: {
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: Date | null;
    emitCanceled?: boolean;
  } = {},
): Promise<void> {
  const ref = await prisma.subscription.findUnique({
    where: { appleOriginalTransactionId },
    select: { tenantId: true },
  });
  if (!ref) return;
  await withTenantContext(ref.tenantId, async () => {
    const local = await prisma.subscription.findUnique({
      where: { appleOriginalTransactionId },
      include: { tier: true },
    });
    if (!local) return;
    await prisma.subscription.update({
      where: { id: local.id },
      data: {
        status,
        ...(options.cancelAtPeriodEnd !== undefined
          ? { cancelAtPeriodEnd: options.cancelAtPeriodEnd }
          : {}),
        ...(options.currentPeriodEnd !== undefined && options.currentPeriodEnd !== null
          ? { currentPeriodEnd: options.currentPeriodEnd }
          : {}),
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

/**
 * Refund eines One-Time-Kaufs rückabwickeln — Spiegel von
 * handleChargeRefunded: Order→REFUNDED, Entitlement entziehen (sofern kein
 * anderer bezahlter Kauf denselben Key hält), Punkte stornieren, Restbestand
 * physischer Produkte zurückbuchen.
 */
export async function reverseAppleOrder(
  appleTransactionId: string,
  eventId: string,
): Promise<boolean> {
  const ref = await prisma.order.findUnique({
    where: { appleTransactionId },
    select: { tenantId: true },
  });
  if (!ref) return false;

  await withTenantContext(ref.tenantId, async () => {
    const order = await prisma.order.findUnique({ where: { appleTransactionId } });
    if (!order) return;
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
          tenantId: order.tenantId,
          userId: order.userId,
          status: "PAID",
          grantedEntitlementKey: order.grantedEntitlementKey,
        },
      });
      if (Number(otherPaidOrders ?? 0) === 0) {
        await prisma.entitlement.deleteMany({
          where: {
            tenantId: order.tenantId,
            userId: order.userId,
            key: order.grantedEntitlementKey,
            source: "PURCHASE",
          },
        });
      }
    }
    await reversePointsByReference({
      tenantId: order.tenantId,
      userId: order.userId,
      refType: "AppleTransaction",
      refId: appleTransactionId,
      reversalRefId: eventId,
    });
    await writeAudit({
      tenantId: order.tenantId,
      action: "apple.iap.refunded",
      targetType: "Order",
      targetId: order.id,
      metadata: { appleTransactionId, eventId },
    });
  });
  return true;
}
