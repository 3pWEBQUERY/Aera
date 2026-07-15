import { NextResponse } from "next/server";
import {
  AppleIapError,
  verifyNotificationPayload,
  verifySignedTransaction,
} from "@/lib/apple-iap";
import {
  reverseAppleOrder,
  syncAppleSubscription,
} from "@/lib/mobile/apple-fulfillment";

// POST /api/mobile/v1/iap/apple-notifications — App Store Server Notifications V2
// ({ signedPayload }, KEIN Bearer). Verarbeitet DID_RENEW, EXPIRED,
// DID_CHANGE_RENEWAL_STATUS, REFUND, GRACE_PERIOD_EXPIRED und synct
// Subscription-Status + Entitlements analog zu customer.subscription.updated /
// charge.refunded im Stripe-Webhook. Unbekannte Typen werden mit 200 quittiert,
// damit Apple nicht endlos retried.

const received = () => NextResponse.json({ received: true });

export async function POST(req: Request) {
  let signedPayload: string;
  try {
    const body = (await req.json()) as { signedPayload?: unknown };
    signedPayload = typeof body.signedPayload === "string" ? body.signedPayload : "";
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!signedPayload) {
    return NextResponse.json({ error: "signedPayload missing" }, { status: 400 });
  }

  let notification;
  try {
    notification = await verifyNotificationPayload(signedPayload);
  } catch (e) {
    if (e instanceof AppleIapError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  const signedTransactionInfo = notification.data?.signedTransactionInfo;
  if (!signedTransactionInfo) return received();

  let txn;
  try {
    txn = await verifySignedTransaction(signedTransactionInfo);
  } catch (e) {
    if (e instanceof AppleIapError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  const originalTransactionId = txn.originalTransactionId;
  const expiresAt =
    typeof txn.expiresDate === "number" ? new Date(txn.expiresDate) : null;

  // Fehler → 500, damit Apple retried; alle Sync-Pfade sind idempotent.
  try {
    switch (notification.notificationType) {
      case "DID_RENEW":
        // Erfolgreiche Verlängerung (auch Recovery aus Billing-Retry).
        await syncAppleSubscription(originalTransactionId, "ACTIVE", {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: expiresAt,
        });
        break;

      case "EXPIRED":
        await syncAppleSubscription(originalTransactionId, "CANCELED", {
          emitCanceled: true,
        });
        break;

      case "GRACE_PERIOD_EXPIRED":
        // Zahlung endgültig gescheitert → wie abgelaufen behandeln.
        await syncAppleSubscription(originalTransactionId, "CANCELED", {
          emitCanceled: true,
        });
        break;

      case "DID_CHANGE_RENEWAL_STATUS":
        // AUTO_RENEW_DISABLED → Kündigung zum Periodenende; ENABLED → zurücknehmen.
        await syncAppleSubscription(
          originalTransactionId,
          "ACTIVE",
          notification.subtype === "AUTO_RENEW_DISABLED"
            ? { cancelAtPeriodEnd: true, currentPeriodEnd: expiresAt }
            : { cancelAtPeriodEnd: false, currentPeriodEnd: expiresAt },
        );
        break;

      case "DID_FAIL_TO_RENEW":
        // Billing-Retry/Grace-Period: Zugriff bleibt, Status auf PAST_DUE.
        await syncAppleSubscription(originalTransactionId, "PAST_DUE", {});
        break;

      case "REFUND": {
        // One-Time-Kauf: Order + Entitlement + Punkte rückabwickeln
        // (Spiegel von charge.refunded); Abo: sofort beenden.
        const reversedOrder = await reverseAppleOrder(
          txn.transactionId,
          notification.notificationUUID ?? txn.transactionId,
        );
        if (!reversedOrder) {
          await syncAppleSubscription(originalTransactionId, "CANCELED", {
            emitCanceled: true,
          });
        }
        break;
      }

      default:
        // z. B. SUBSCRIBED/ONE_TIME_CHARGE — Fulfillment läuft über /iap/validate.
        break;
    }
  } catch (e) {
    console.error(
      `Apple notification failed (${notification.notificationType}, ${notification.notificationUUID}):`,
      e,
    );
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return received();
}
