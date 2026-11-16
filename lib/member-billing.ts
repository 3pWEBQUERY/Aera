import "server-only";
import prisma from "./prisma";
import { cancelStripeSubscriptionsImmediately } from "./stripe-cleanup";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Abrechnung beenden, wenn ein Admin eine Mitgliedschaft sperrt, zurückstellt
 * oder die Stufe wechselt — gemeinsam für das Web-Dashboard
 * (updateMemberAction) und die Mobile-Studio-API.
 *
 * Reihenfolge ist Pflicht: erst muss Stripe bestätigen, dass kein Vertrag mehr
 * abbucht (`cancelMemberStripeSubscriptions`, wirft sonst), dann werden lokal
 * Abo-Zeilen beendet und der Stufen-Zugang entzogen. Andernfalls zahlt ein
 * gesperrtes Mitglied weiter oder behält den bezahlten Zugang.
 */

/** Kündigt alle Stripe-Abos des Mitglieds sofort. Wirft, wenn Stripe nicht bestätigt. */
export async function cancelMemberStripeSubscriptions(
  tenantId: string,
  userId: string,
): Promise<number> {
  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId, userId, stripeSubscriptionId: { not: null } },
    select: { stripeSubscriptionId: true },
  });
  await cancelStripeSubscriptionsImmediately(
    subscriptions.map((subscription) => subscription.stripeSubscriptionId),
  );
  return subscriptions.length;
}

type SubscriptionClient = Pick<Prisma.TransactionClient, "subscription">;

/** Lokale Abo-Zeilen beenden (nach erfolgreicher Stripe-Kündigung). */
export async function markMemberSubscriptionsCanceled(
  tx: SubscriptionClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  await tx.subscription.updateMany({
    where: { tenantId, userId, status: { not: "CANCELED" } },
    data: { status: "CANCELED", cancelAtPeriodEnd: false },
  });
}

/** Gesperrte/zurückgestellte Mitglieder behalten nie den Zugang ihrer Stufe. */
export async function revokeTierAccess(
  tenantId: string,
  userId: string,
  tierEntitlementKey: string,
): Promise<void> {
  await prisma.entitlement.deleteMany({
    where: { tenantId, userId, key: tierEntitlementKey },
  });
}
