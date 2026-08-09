import "server-only";
import { randomUUID } from "node:crypto";
import { systemPrisma } from "./prisma";
import { env, paymentsConfigured } from "./env";
import { resolvePayoutAccount } from "./payouts";
import { canReceive, createTipCheckout, getConnectStatus, platformFeeCents } from "./stripe";
import { profileUrl } from "./url";
import { checkTipAmount } from "./tip-amount";

/**
 * Ein Trinkgeld anlegen und zur Kasse schicken.
 *
 * Der ganze Weg laeuft ueber `systemPrisma`, und das ist Absicht. Wer eine
 * Zeile in `AeliTip` schreibt, legt fest, wohin Geld fliesst — dafuer braucht
 * es `Tenant.ownerId`, eine Spalte, die die Rolle `aeli_app` bewusst nicht
 * sieht (lib/payouts.ts erklaert, warum sie noetig ist). Ein oeffentlicher
 * Schreibpfad wie bei den Leads waere hier also nicht nur unnoetig, sondern
 * ein zweiter Ort, an dem ueber Geld entschieden wird.
 *
 * Dafuer schreibt diese Datei jede Bedingung aus, die sonst eine Policy
 * uebernaehme: nur veroeffentlichte Profile, nur der Baustein dieses Profils,
 * nur Betraege innerhalb der Grenzen.
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
  const profile = await systemPrisma.aeliProfile.findFirst({
    where: { handle: input.handle, status: "PUBLISHED" },
    select: {
      id: true,
      userId: true,
      handle: true,
      displayName: true,
      linkedTenantId: true,
      blocks: {
        where: { id: input.blockId, type: "TIP", isVisible: true },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!profile || profile.blocks.length === 0) return { ok: false, problem: "not-found" };

  const payout = await resolvePayoutAccount({
    userId: profile.userId,
    linkedTenantId: profile.linkedTenantId,
  });
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

  await systemPrisma.aeliTip.create({
    data: {
      id,
      profileId: profile.id,
      blockId: profile.blocks[0]!.id,
      amountCents,
      currency: "eur",
      message: input.message.trim().slice(0, 280) || null,
      destinationAccountId: payout.stripeAccountId,
      platformFeeCents: feeCents,
      status: "PENDING",
    },
  });

  const back = profileUrl(profile.handle);
  const url = await createTipCheckout({
    tip: {
      id,
      amountCents,
      currency: "eur",
      label: `Trinkgeld für ${profile.displayName}`,
    },
    destinationAccountId: payout.stripeAccountId,
    applicationFeeCents: feeCents,
    successUrl: `${back}?danke=1`,
    cancelUrl: `${back}?abgebrochen=1`,
  }).catch(() => null);

  if (!url) {
    // Die Zeile wieder wegraeumen: eine PENDING-Zahlung, die nie eine Session
    // bekommen hat, kann kein Webhook mehr abschliessen. Sie bliebe fuer immer
    // stehen und wuerde die Statistik verfaelschen.
    await systemPrisma.aeliTip.delete({ where: { id } }).catch(() => undefined);
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
