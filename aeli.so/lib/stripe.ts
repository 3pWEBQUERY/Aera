import "server-only";
import Stripe from "stripe";
import { env, paymentsConfigured } from "./env";

/**
 * Stripe fuer Aeli.
 *
 * Bewusst klein. Aera hat 1.600 Zeilen Webhook, weil dort Bestellungen,
 * Abos, Entitlements, Punkte und Provisionen zusammenhaengen. Hier gibt es
 * genau eine Zahlungsart: ein einmaliges Trinkgeld an den Creator. Alles, was
 * diese Datei kann, dient diesem einen Fall.
 *
 * Dieselbe Plattform wie Aera (siehe `STRIPE_SECRET_KEY` in lib/env.ts). Die
 * Connect-Funktionen sind deshalb absichtlich deckungsgleich mit Aeras
 * `lib/stripe.ts`: eine `acct_…`-Kennung, die dort angelegt wurde, muss hier
 * ohne Umweg benutzbar sein.
 */

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!paymentsConfigured()) return null;
  if (!client) client = new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * Der Anteil der Plattform, in Cent.
 *
 * Aufgerundet wird nicht: bei 5 % auf 3,00 € sind das 15 Cent, und ein Cent
 * mehr zulasten des Creators waere eine stille Erhoehung.
 */
export function platformFeeCents(amountCents: number, feePercent: number): number {
  return Math.round((amountCents * feePercent) / 100);
}

// --------------------------------------------------------------- Connect

/** Ein Express-Konto, damit der Creator Auszahlungen empfangen kann. */
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
    metadata: { product: "aeli" },
  });
  return account.id;
}

/** Der gehostete Einrichtungsweg. Der Link ist einmalig und laeuft ab. */
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

/** Was Stripe gerade ueber das Konto sagt. `null` heisst: nicht erreichbar. */
export async function getConnectStatus(accountId: string): Promise<ConnectStatus | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return {
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
    };
  } catch {
    return null;
  }
}

/** Einmal-Link in das Express-Dashboard des Creators (Auszahlungen, Belege). */
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

/**
 * Bereit zum Empfangen?
 *
 * Alle drei Flaggen, nicht nur `chargesEnabled`. Ein Konto, das kassieren
 * darf, aber nicht auszahlen, sammelt Geld an, das nie ankommt — und der
 * Creator merkt es erst Wochen spaeter.
 */
export function canReceive(status: ConnectStatus | null): boolean {
  return Boolean(status?.chargesEnabled && status.payoutsEnabled && status.detailsSubmitted);
}

// --------------------------------------------------------------- Checkout

/**
 * Die Kasse fuer ein Trinkgeld.
 *
 * `transfer_data.destination` macht daraus eine Destination-Charge: die
 * Zahlung laeuft ueber die Plattform, das Geld landet aber auf dem Konto des
 * Creators, abzueglich `application_fee_amount`. Derselbe Aufbau wie in Aeras
 * `createTipCheckout` — wer beide liest, soll nicht zwei Modelle im Kopf
 * behalten muessen.
 */
export async function createTipCheckout(args: {
  tip: { id: string; amountCents: number; currency: string; label: string };
  destinationAccountId: string;
  applicationFeeCents: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: args.tip.currency,
            unit_amount: args.tip.amountCents,
            product_data: { name: args.tip.label },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: args.applicationFeeCents,
        transfer_data: { destination: args.destinationAccountId },
        metadata: { kind: "aeli_tip", tipId: args.tip.id },
      },
      // Auch auf der Session, nicht nur auf dem PaymentIntent: der Webhook
      // sieht bei `checkout.session.completed` nur die Session.
      metadata: { kind: "aeli_tip", tipId: args.tip.id },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    },
    // Zweimal auf denselben Knopf zu klicken soll eine Zahlung ergeben, nicht
    // zwei. Die Trinkgeld-Zeile existiert zu diesem Zeitpunkt bereits und ist
    // damit der stabile Schluessel.
    { idempotencyKey: `aeli:tip:${args.tip.id}` },
  );

  return session.url;
}

/** Der PaymentIntent einer Session — als Kennung, nicht als Objekt. */
export function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const intent = session.payment_intent;
  return typeof intent === "string" ? intent : (intent?.id ?? null);
}
