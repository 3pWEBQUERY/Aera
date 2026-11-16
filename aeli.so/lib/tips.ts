import "server-only";
import { randomUUID } from "node:crypto";
import prisma from "./prisma";
import { createTipRow, discardTipRow } from "./db-functions";
import { env, paymentsConfigured } from "./env";
import { resolvePayoutAccount } from "./payouts";
import { canReceive, createTipCheckout, getConnectStatus, platformFeeCents } from "./stripe";
import { profileUrl } from "./url";
import { checkTipAmount } from "./tip-amount";

/**
 * Ein Trinkgeld anlegen und zur Kasse schicken.
 *
 * Wer eine Zeile in `AeliTip` schreibt, legt fest, wohin Geld fliesst — dafuer
 * braucht es `Tenant.ownerId`, eine Spalte, die die Rolle `aeli_app` bewusst
 * nicht sieht (lib/payouts.ts erklaert, warum sie noetig ist). Angelegt wird
 * deshalb ueber die Datenbankfunktion `aeli_create_tip`: sie bestimmt das Ziel
 * SELBST und prueft noch einmal jede Bedingung — veroeffentlichtes Profil,
 * sichtbarer Trinkgeld-Baustein dieses Profils, Betrag innerhalb der Grenzen.
 * Diese Datei stellt dieselben Fragen vorher, damit der Besucher eine
 * verstaendliche Antwort bekommt statt eines „ging nicht“.
 */

export type TipProblem =
  | "unavailable"
  | "not-found"
  | "invalid-amount"
  | "amount-too-small"
  | "amount-too-large"
  | "checkout-failed";

export interface TipStart {
  handle: string;
  blockId: string;
  amountCents: number | null;
  message: string;
}

/** Die Kassenadresse — oder der Grund, warum es keine gibt. */
export async function startTip(input: TipStart): Promise<
  { ok: true; url: string } | { ok: false; problem: TipProblem }
> {
  if (!paymentsConfigured()) return { ok: false, problem: "unavailable" };

  const amountProblem = checkTipAmount(input.amountCents);
  if (amountProblem) {
    return {
      ok: false,
      problem:
        amountProblem === "invalid" ? "invalid-amount"
        : amountProblem === "too-small" ? "amount-too-small"
        : "amount-too-large",
    };
  }
  const amountCents = input.amountCents!;

  // Nur veroeffentlichte Seiten nehmen Geld an. Ein Entwurf ist nicht
  // oeffentlich, also kann ihn auch niemand versehentlich bezahlen.
  // Ueber die oeffentliche Rolle: sie sieht ohnehin nur Veroeffentlichtes
  // (und nur sichtbare Bausteine auf sichtbaren Karten).
  const profile = await prisma.aeliProfile.findFirst({
    where: { handle: input.handle, status: "PUBLISHED" },
    select: {
      id: true,
      handle: true,
      displayName: true,
      blocks: {
        where: { id: input.blockId, type: "TIP", isVisible: true },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!profile || profile.blocks.length === 0) return { ok: false, problem: "not-found" };

  const payout = await resolvePayoutAccount(profile.id);
  if (!payout) return { ok: false, problem: "unavailable" };

  // Ob das Konto WIRKLICH kassieren und auszahlen darf, weiss nur Stripe. Die
  // Frage wird hier gestellt und nicht beim Rendern der Seite: einmal pro
  // Zahlungsversuch ist ein Netzaufruf vertretbar, einmal pro Besucher nicht.
  //
  // Ein zwischengespeichertes „ist bereit" waere die Alternative — und die
  // schlechtere: es geht genau in dem Moment schief, in dem Stripe ein Konto
  // sperrt, und dann nimmt eine Seite Geld an, das nirgends ankommt.
  if (!canReceive(await getConnectStatus(payout.stripeAccountId))) {
    return { ok: false, problem: "unavailable" };
  }

  const feeCents = platformFeeCents(amountCents, env.AELI_PLATFORM_FEE_PERCENT);
  const id = randomUUID();

  // Das Ziel, das die Datenbank beim Anlegen bestimmt, ist das verbindliche —
  // aendert sich die Verknuepfung zwischen Frage und Anlegen, gilt dieses.
  const destination = await createTipRow({
    id,
    profileId: profile.id,
    blockId: profile.blocks[0]!.id,
    amountCents,
    message: input.message.trim().slice(0, 280),
    feeCents,
  });
  if (!destination) return { ok: false, problem: "unavailable" };

  const back = profileUrl(profile.handle);
  const url = await createTipCheckout({
    tip: {
      id,
      amountCents,
      currency: "eur",
      label: `Trinkgeld für ${profile.displayName}`,
    },
    destinationAccountId: destination,
    applicationFeeCents: feeCents,
    successUrl: `${back}?danke=1`,
    cancelUrl: `${back}?abgebrochen=1`,
  }).catch(() => null);

  if (!url) {
    // Die Zeile wieder wegraeumen: eine PENDING-Zahlung, die nie eine Session
    // bekommen hat, kann kein Webhook mehr abschliessen. Sie bliebe fuer immer
    // stehen und wuerde die Statistik verfaelschen.
    await discardTipRow(id).catch(() => undefined);
    return { ok: false, problem: "checkout-failed" };
  }

  return { ok: true, url };
}

export const TIP_PROBLEM_TEXT: Record<TipProblem, string> = {
  unavailable: "Diese Seite nimmt gerade keine Trinkgelder an.",
  "not-found": "Diesen Baustein gibt es nicht mehr.",
  "invalid-amount": "Bitte gib einen Betrag wie 5 oder 7,50 ein.",
  "amount-too-small": "Mindestens 1 €.",
  "amount-too-large": "Höchstens 500 €.",
  "checkout-failed": "Die Bezahlseite ließ sich nicht öffnen. Versuch es noch einmal.",
};
