import "server-only";
import { randomBytes } from "crypto";
import prisma from "./prisma";
import { awardPoints } from "./gamification";
import { notify } from "./notifications";

/**
 * Referral-Programm: Mitglieder werben Mitglieder.
 *
 * - Jedes Mitglied hat einen (lazily erzeugten) Einladungs-Code; der Link ist
 *   `/c/{slug}/join?ref={code}`.
 * - Beitritt über einen Link setzt `membership.referredById` und erzeugt eine
 *   ReferralConversion (kind "join"). Punkte gibt es über den Gamification-
 *   Trigger REFERRAL (vom Creator konfigurierbar).
 * - Bezahlte Käufe geworbener Mitglieder erzeugen Conversions (kind
 *   "purchase") mit Provision gemäß `tenant.referralPercent`. Auszahlung der
 *   Provision erfolgt (vorerst) manuell durch den Creator.
 *
 * Alle Schreibpfade sind best effort: Referral-Fehler dürfen Join/Kauf nie
 * blockieren.
 */

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // ohne i/l/o/0/1

function generateCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

/** Liefert den Einladungs-Code des Mitglieds und erzeugt ihn bei Bedarf. */
export async function ensureReferralCode(
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
  if (!membership || membership.status !== "ACTIVE") return null;
  if (membership.referralCode) return membership.referralCode;

  // Kollisionen sind bei 31^8 praktisch ausgeschlossen; trotzdem 3 Versuche.
  for (let i = 0; i < 3; i++) {
    try {
      const code = generateCode();
      await prisma.membership.update({
        where: { id: membership.id },
        data: { referralCode: code },
      });
      return code;
    } catch {
      // unique(tenantId, referralCode) verletzt -> neuer Versuch
    }
  }
  return null;
}

/** Löst einen ?ref=-Code zum werbenden Mitglied auf (nur aktive Mitglieder). */
export async function resolveReferrer(
  tenantId: string,
  code: string | null | undefined,
): Promise<string | null> {
  const trimmed = (code ?? "").trim().toLowerCase();
  if (!trimmed || trimmed.length > 32) return null;
  const membership = await prisma.membership.findFirst({
    where: { tenantId, referralCode: trimmed, status: "ACTIVE" },
    select: { userId: true },
  });
  return membership?.userId ?? null;
}

/**
 * Verbucht einen Beitritt über einen Referral-Link: setzt `referredById`,
 * erzeugt die Join-Conversion, vergibt Punkte und benachrichtigt den Werber.
 */
export async function recordReferralJoin(input: {
  tenantId: string;
  tenantSlug: string;
  referrerId: string;
  referredId: string;
  referredName: string;
}): Promise<void> {
  const { tenantId, referrerId, referredId } = input;
  if (referrerId === referredId) return;
  try {
    await prisma.membership.updateMany({
      // Nur setzen, wenn noch kein Werber hinterlegt ist.
      where: { tenantId, userId: referredId, referredById: null },
      data: { referredById: referrerId },
    });
    // refId = geworbener User -> unique Constraint dedupliziert Wiederholungen.
    await prisma.referralConversion.create({
      data: {
        tenantId,
        referrerId,
        referredId,
        kind: "join",
        refType: "User",
        refId: referredId,
      },
    });
    await awardPoints({
      tenantId,
      userId: referrerId,
      trigger: "REFERRAL",
      refType: "User",
      refId: referredId,
    });
    await notify({
      tenantId,
      userId: referrerId,
      actorId: referredId,
      type: "REACTION", // generische, positive Benachrichtigung
      message: `${input.referredName} ist über deinen Einladungslink beigetreten.`,
      href: `/c/${input.tenantSlug}/members`,
      refType: "Referral",
      refId: referredId,
    });
  } catch (e) {
    // Duplikat (P2002) oder anderes -> Join nie blockieren.
    if ((e as { code?: string }).code !== "P2002") {
      console.error("recordReferralJoin failed:", e);
    }
  }
}

/**
 * Verbucht die Provision, wenn ein geworbenes Mitglied etwas kauft.
 * `refId` (z. B. Stripe-Session/Order-ID) dedupliziert Webhook-Replays.
 */
export async function recordReferralPurchase(input: {
  tenantId: string;
  referredUserId: string;
  amountCents: number;
  refType: string;
  refId: string;
}): Promise<void> {
  try {
    const [membership, tenant] = await Promise.all([
      prisma.membership.findUnique({
        where: {
          tenantId_userId: {
            tenantId: input.tenantId,
            userId: input.referredUserId,
          },
        },
        select: { referredById: true },
      }),
      prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { referralPercent: true },
      }),
    ]);
    const referrerId = membership?.referredById;
    if (!referrerId || !tenant) return;

    const percent = Math.max(0, Math.min(tenant.referralPercent, 100));
    const commission = Math.round((input.amountCents * percent) / 100);

    await prisma.referralConversion.create({
      data: {
        tenantId: input.tenantId,
        referrerId,
        referredId: input.referredUserId,
        kind: "purchase",
        amountCents: input.amountCents,
        commissionCents: commission,
        refType: input.refType,
        refId: input.refId,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") {
      console.error("recordReferralPurchase failed:", e);
    }
  }
}

/** Preserve a referral conversion but remove it from active commission totals. */
export async function reverseReferralPurchase(input: {
  tenantId: string;
  stripeSessionId: string;
}): Promise<void> {
  await prisma.referralConversion.updateMany({
    where: {
      tenantId: input.tenantId,
      kind: "purchase",
      refType: "StripeSession",
      refId: input.stripeSessionId,
      reversedAt: null,
    },
    data: { reversedAt: new Date() },
  });
}
