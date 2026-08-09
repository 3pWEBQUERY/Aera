import "server-only";
import { systemPrisma } from "./prisma";

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
 * Gelesen wird ueber die privilegierte Verbindung, weil es anders nicht geht:
 * `Tenant.ownerId` und `Tenant.stripeAccountId` sind fuer die Rolle `aeli_app`
 * gesperrt (aeli.so/scripts/check-rls.ts prueft genau das). Die Abfrage ist
 * dafuer eng: ein Nutzer, ein Tenant, drei Spalten.
 */

export type PayoutSource = "aeli" | "aera";

export interface PayoutAccount {
  stripeAccountId: string;
  source: PayoutSource;
  /** Nur bei `aera`: welche Community ihr Konto hergibt. */
  communityName: string | null;
}

export interface PayoutOwner {
  userId: string;
  linkedTenantId: string | null;
}

export async function resolvePayoutAccount(owner: PayoutOwner): Promise<PayoutAccount | null> {
  const own = await systemPrisma.aeliPayoutAccount.findUnique({
    where: { userId: owner.userId },
    select: { stripeAccountId: true },
  });
  if (own) {
    return { stripeAccountId: own.stripeAccountId, source: "aeli", communityName: null };
  }

  if (!owner.linkedTenantId) return null;

  const tenant = await systemPrisma.tenant.findFirst({
    // `ownerId` gehoert in die Abfrage, nicht in ein `if` danach: so kann kein
    // spaeterer Umbau den Vergleich versehentlich weglassen.
    where: { id: owner.linkedTenantId, ownerId: owner.userId, status: "ACTIVE" },
    select: { name: true, stripeAccountId: true },
  });
  if (!tenant?.stripeAccountId) return null;

  return {
    stripeAccountId: tenant.stripeAccountId,
    source: "aera",
    communityName: tenant.name,
  };
}

/**
 * Gibt es eine verknuepfte Community, die ein Konto beisteuern KOENNTE?
 *
 * Nur fuer die Anzeige in den Einstellungen: „Diese Seite zeigt auf eine
 * Community, die dir nicht gehoert — ihr Stripe-Konto wird deshalb nicht
 * benutzt." Ohne diesen Satz wirkt die fehlende Uebernahme wie ein Fehler.
 */
export interface LinkedCommunityPayout {
  name: string;
  ownedByYou: boolean;
  hasStripe: boolean;
}

export async function linkedCommunityPayout(
  owner: PayoutOwner,
): Promise<LinkedCommunityPayout | null> {
  if (!owner.linkedTenantId) return null;
  const tenant = await systemPrisma.tenant.findUnique({
    where: { id: owner.linkedTenantId },
    select: { name: true, ownerId: true, stripeAccountId: true },
  });
  if (!tenant) return null;
  return {
    name: tenant.name,
    ownedByYou: tenant.ownerId === owner.userId,
    hasStripe: Boolean(tenant.stripeAccountId),
  };
}

/** Das eigene, in Aeli verbundene Konto — unabhaengig davon, welches gilt. */
export async function ownPayoutAccountId(userId: string): Promise<string | null> {
  const own = await systemPrisma.aeliPayoutAccount.findUnique({
    where: { userId },
    select: { stripeAccountId: true },
  });
  return own?.stripeAccountId ?? null;
}
