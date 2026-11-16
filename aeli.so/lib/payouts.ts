import "server-only";
import prisma from "./prisma";
import { linkedCommunityPayoutRow, profilePayout } from "./db-functions";

/**
 * Wohin das Geld geht.
 *
 * Das ist die heikelste Frage in dieser App, und deshalb steht sie an genau
 * einer Stelle. Es gibt zwei Quellen, in dieser Reihenfolge:
 *
 *   1. Ein Konto, das der Creator in Aeli selbst verbunden hat.
 *   2. Das Konto der verknuepften Aera-Community — aber NUR, wenn sie
 *      demselben Konto gehoert.
 *
 * Punkt zwei ist der Grund fuer die ganze Datei. `AeliProfile.linkedTenantId`
 * kann ueber einen Verbindungscode auf eine FREMDE Community zeigen: jemand
 * verweist von seiner Bio-Seite auf die Community eines anderen. Wuerde Aeli
 * daraus ein Auszahlungskonto ableiten, liefe jedes Trinkgeld an diese Seite
 * auf das Stripe-Konto eines Dritten. Der Besitzvergleich unten ist damit
 * keine Vorsichtsmassnahme, sondern die Bedingung, unter der die Bequemlichkeit
 * „nutzt automatisch Aeras Stripe" ueberhaupt zulaessig ist.
 *
 * Beantwortet wird die Frage in der Datenbank (`aeli_profile_payout`), weil es
 * anders nicht geht: `Tenant.ownerId` und `Tenant.stripeAccountId` sind fuer
 * die Rolle `aeli_app` gesperrt (aeli.so/scripts/check-rls.ts prueft genau
 * das). Die Funktion nimmt nur eine Profil-ID — veroeffentlicht, oder das
 * eigene im Besitzerkontext — und leitet Besitzer und Community selbst daraus
 * ab. Ein Aufrufer kann ihr also keinen fremden Besitzer unterschieben.
 */

export type PayoutSource = "aeli" | "aera";

export interface PayoutAccount {
  stripeAccountId: string;
  source: PayoutSource;
  /** Nur bei `aera`: welche Community ihr Konto hergibt. */
  communityName: string | null;
}

/** Wohin Trinkgelder fuer dieses Profil gehen — oder `null`. */
export async function resolvePayoutAccount(profileId: string): Promise<PayoutAccount | null> {
  const row = await profilePayout(profileId);
  if (!row?.stripeAccountId) return null;
  return {
    stripeAccountId: row.stripeAccountId,
    source: row.source === "aera" ? "aera" : "aeli",
    communityName: row.communityName,
  };
}

/**
 * Gibt es eine verknuepfte Community, die ein Konto beisteuern KOENNTE?
 *
 * Nur fuer die Anzeige in den Einstellungen: „Diese Seite zeigt auf eine
 * Community, die dir nicht gehoert — ihr Stripe-Konto wird deshalb nicht
 * benutzt." Ohne diesen Satz wirkt die fehlende Uebernahme wie ein Fehler.
 * Braucht den Besitzerkontext.
 */
export interface LinkedCommunityPayout {
  name: string;
  ownedByYou: boolean;
  hasStripe: boolean;
}

export async function linkedCommunityPayout(): Promise<LinkedCommunityPayout | null> {
  return linkedCommunityPayoutRow();
}

/**
 * Das eigene, in Aeli verbundene Konto — unabhaengig davon, welches gilt.
 * `AeliPayoutAccount` ist fuer den Besitzer lesbar (Policy
 * `aeli_owner_payout`); braucht den Besitzerkontext.
 */
export async function ownPayoutAccountId(userId: string): Promise<string | null> {
  const own = await prisma.aeliPayoutAccount.findUnique({
    where: { userId },
    select: { stripeAccountId: true },
  });
  return own?.stripeAccountId ?? null;
}
