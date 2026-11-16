"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { withUserContext } from "@/lib/prisma";
import { connectPayoutAccountRow, disconnectPayoutAccountRow } from "@/lib/db-functions";
import { getCurrentUser } from "@/lib/auth";
import { getOwnProfile } from "@/lib/profile";
import { env, paymentsConfigured } from "@/lib/env";
import { ownPayoutAccountId, resolvePayoutAccount } from "@/lib/payouts";
import {
  createConnectAccount,
  createDashboardLoginLink,
  createOnboardingLink,
} from "@/lib/stripe";
import { formError, type FormState } from "@/lib/action-state";

/**
 * Das Auszahlungskonto verbinden, ansehen, trennen.
 *
 * `aeli_app` darf `AeliPayoutAccount` nur lesen. Angelegt und getrennt wird
 * über zwei Datenbankfunktionen (`aeli_connect_payout_account`,
 * `aeli_disconnect_payout_account`), die den Besitzer aus dem
 * Besitzerkontext nehmen — deshalb läuft hier alles in `withUserContext`.
 */

const SETTINGS = "/studio/einstellungen";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?weiter=/studio/einstellungen");
  return user;
}

/**
 * Verbinden — oder die Einrichtung fortsetzen.
 *
 * Beides ist derselbe Knopf, und das ist kein Zufall: Stripes Onboarding wird
 * regelmäßig abgebrochen (Ausweis nicht zur Hand, Bankdaten nicht im Kopf).
 * Wer wiederkommt, soll nicht ein zweites Konto anlegen, sondern dort
 * weitermachen, wo er aufgehört hat. Deshalb wird ein vorhandenes Konto
 * wiederverwendet und nur ein neuer Link geholt.
 */
export async function connectPayoutAction(): Promise<void> {
  const user = await requireUser();
  if (!paymentsConfigured()) redirect(`${SETTINGS}?zahlung=nicht-eingerichtet`);

  let accountId = await withUserContext(user.id, () => ownPayoutAccountId(user.id));

  if (!accountId) {
    accountId = await createConnectAccount(user.email);
    if (!accountId) redirect(`${SETTINGS}?zahlung=fehlgeschlagen`);
    const created = accountId;
    await withUserContext(user.id, () => connectPayoutAccountRow(randomUUID(), created));
  }

  const link = await createOnboardingLink(
    accountId,
    // `refresh_url` wird aufgerufen, wenn der Link abgelaufen ist. Zurück auf
    // die Einstellungen heißt: derselbe Knopf, neuer Link.
    `${env.AELI_APP_URL}${SETTINGS}?zahlung=erneut`,
    `${env.AELI_APP_URL}${SETTINGS}?zahlung=zurueck`,
  );
  if (!link) redirect(`${SETTINGS}?zahlung=fehlgeschlagen`);

  redirect(link);
}

/** Einmal-Link in das Stripe-Dashboard des Creators. */
export async function payoutDashboardAction(): Promise<void> {
  const user = await requireUser();
  const accountId = await withUserContext(user.id, () => ownPayoutAccountId(user.id));
  if (!accountId) redirect(SETTINGS);

  const link = await createDashboardLoginLink(accountId);
  redirect(link ?? SETTINGS);
}

/**
 * Trennen.
 *
 * Gelöscht wird nur die Verbindung, nicht das Stripe-Konto: dort liegen
 * Umsätze, Belege und womöglich noch nicht ausgezahltes Geld. Was Aeli
 * anlegen durfte, darf Aeli auch vergessen — was Stripe gehört, nicht.
 *
 * Bereits bezahlte Trinkgelder behalten ihre `destinationAccountId`. Sie sagt,
 * wohin das Geld damals ging, und das bleibt wahr.
 */
export async function disconnectPayoutAction(_prev: FormState): Promise<FormState> {
  const user = await requireUser();
  const profile = await getOwnProfile();

  const deleted = await withUserContext(user.id, () => disconnectPayoutAccountRow());
  if (deleted === 0) return formError("Es war kein Konto verbunden.");

  revalidatePath(SETTINGS);
  if (profile) revalidatePath(`/p/${profile.handle}`);

  // Nach dem Trennen kann die Aera-Community einspringen. Das ist kein Fehler,
  // aber eine Änderung, die man erfahren sollte.
  const fallback = profile
    ? await withUserContext(user.id, () => resolvePayoutAccount(profile.id))
    : null;

  return {
    notice: fallback
      ? `Getrennt. Trinkgelder laufen jetzt über „${fallback.communityName}".`
      : "Getrennt. Der Trinkgeld-Baustein nimmt kein Geld mehr an.",
  };
}
