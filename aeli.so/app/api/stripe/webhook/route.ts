import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { systemPrisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getStripe, paymentIntentId } from "@/lib/stripe";

/**
 * Was Stripe zurueckmeldet.
 *
 * Ein eigener Endpunkt mit eigenem Geheimnis — nicht Aeras. Die beiden Apps
 * hoeren auf verschiedene Ereignisse und verbuchen verschiedene Dinge; ein
 * geteiltes Secret wuerde nur verdecken, dass es zwei Empfaenger sind, und
 * jeder muesste die Ereignisse des anderen wegwerfen.
 *
 * Drei Eigenschaften, auf die es ankommt:
 *
 *   Signatur zuerst. Der Rumpf wird als Rohtext gelesen und geprueft, bevor
 *   irgendetwas daraus gelesen wird. Ohne das koennte jeder eine Zahlung als
 *   bezahlt melden.
 *
 *   Doppelt zaehlt einmal. Stripe liefert erneut, wenn eine Antwort ausbleibt.
 *   Jede Aenderung haengt deshalb an einer Bedingung auf dem alten Zustand
 *   (`status: "PENDING"`), nicht an einem Vorher-Lesen.
 *
 *   Unbekanntes ist kein Fehler. Wer den Endpunkt in Stripe versehentlich auf
 *   alle Ereignisse stellt, soll keine Fehlerflut bekommen — nur ein 200 und
 *   ein Achselzucken.
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe || !env.AELI_STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "unsigned" }, { status: 400 });

  let event: Stripe.Event;
  try {
    // `request.text()`, nicht `json()`: die Signatur gilt fuer die Bytes, und
    // ein Umweg ueber JSON.parse/stringify aendert sie.
    const body = await request.text();
    event = stripe.webhooks.constructEvent(body, signature, env.AELI_STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await markPaid(event.data.object);
    } else if (event.type === "charge.refunded") {
      await markRefunded(event.data.object);
    }
  } catch (error) {
    // 500 heisst fuer Stripe: nochmal versuchen. Das ist hier richtig — ein
    // Datenbankfehler soll die Zahlung nicht stillschweigend verschlucken.
    console.error("Aeli-Webhook", event.type, error);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function markPaid(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== "aeli_tip") return;
  const tipId = session.metadata.tipId;
  if (!tipId) return;
  // Eine Session kann `complete` sein, ohne bezahlt zu sein (verzoegerte
  // Zahlarten). Bezahlt ist erst `paid`.
  if (session.payment_status !== "paid") return;

  await systemPrisma.aeliTip.updateMany({
    where: { id: tipId, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId(session),
      // Stripe fragt die Adresse fuer den Beleg ab. Sie ist das Einzige, was
      // wir ueber den Absender erfahren, und sie bleibt beim Creator.
      supporterEmail: session.customer_details?.email ?? null,
    },
  });
}

async function markRefunded(charge: Stripe.Charge): Promise<void> {
  const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  if (!intent) return;

  // Teilerstattungen bleiben `PAID`: der Creator hat den Rest behalten, und
  // „erstattet" waere dafuer das falsche Wort.
  if (charge.amount_refunded < charge.amount) return;

  await systemPrisma.aeliTip.updateMany({
    where: { stripePaymentIntentId: intent, status: "PAID" },
    data: { status: "REFUNDED" },
  });
}
