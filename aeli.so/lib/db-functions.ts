import "server-only";
import { queryAsAeliUser } from "./prisma";

/**
 * Die privilegierten Pfade, als Datenbankfunktionen.
 *
 * Früher lief alles, was `aeli_app` nicht darf, über die Eigentümer-Verbindung
 * von Aera. Jetzt gibt es dafür je eine SECURITY-DEFINER-Funktion (Migration
 * 20261116210000_aeli_least_privilege), die genau eine Frage beantwortet oder
 * genau einen Schreibvorgang ausführt. Aufgerufen werden sie unter der Rolle
 * `aeli_app` — und nur `aeli_app` darf sie ausführen.
 *
 * Funktionen, die dem angemeldeten Creator gehören (Handle wechseln, eigene
 * Communities, Auszahlungskonto), lesen den Besitzer aus `aeli.user_id`. Der
 * Aufrufer muss deshalb in `withUserContext(...)` stehen, sonst antworten sie
 * leer.
 *
 * Diese Datei ist die vollständige Liste. Was hier nicht steht, darf Aeli
 * außerhalb der RLS-Policies nicht.
 */

// ---------------------------------------------------------------------------
// Anmeldung
// ---------------------------------------------------------------------------

export interface AuthRow {
  id: string;
  passwordHash: string;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  sessionVersion: number;
  aeliSessionVersion: number;
  accountStatus: string;
}

export async function authLookup(email: string): Promise<AuthRow | null> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<AuthRow[]>`SELECT * FROM aeli_auth_lookup(${email})`,
  );
  return rows[0] ?? null;
}

export interface SessionUserRow {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  sessionVersion: number;
  aeliSessionVersion: number;
  accountStatus: string;
}

export async function sessionUser(userId: string): Promise<SessionUserRow | null> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<SessionUserRow[]>`SELECT * FROM aeli_session_user(${userId})`,
  );
  return rows[0] ?? null;
}

/** `null` heißt: die Adresse ist schon vergeben. */
export async function registerUserRow(input: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  termsVersion: string;
  privacyVersion: string;
}): Promise<{ id: string; sessionVersion: number } | null> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ id: string; sessionVersion: number }[]>`
      SELECT * FROM aeli_register_user(
        ${input.id}, ${input.email}, ${input.name}, ${input.passwordHash},
        ${input.termsVersion}, ${input.privacyVersion}
      )`,
  );
  return rows[0] ?? null;
}

/** Entwertet alle Aeli-Sitzungen des Kontos (nicht die von Aera). */
export async function endSessions(userId: string, aeliSessionVersion: number): Promise<boolean> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ ok: boolean }[]>`
      SELECT aeli_end_sessions(${userId}, ${aeliSessionVersion}::integer) AS ok`,
  );
  return Boolean(rows[0]?.ok);
}

/** Restliche Codes nach dem Verbrauch, oder -1, wenn der Code nicht passte. */
export async function consumeRecoveryCodeHash(userId: string, codeHash: string): Promise<number> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ remaining: number }[]>`
      SELECT aeli_consume_totp_recovery_code(${userId}, ${codeHash}) AS remaining`,
  );
  return Number(rows[0]?.remaining ?? -1);
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

export async function handleTaken(handle: string, ownProfileId?: string): Promise<boolean> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ taken: boolean }[]>`
      SELECT aeli_handle_taken(${handle}, ${ownProfileId ?? null}) AS taken`,
  );
  return Boolean(rows[0]?.taken);
}

export async function freeHandleCandidates(candidates: string[]): Promise<string[]> {
  if (candidates.length === 0) return [];
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ handle: string }[]>`
      SELECT handle FROM aeli_free_handles(${candidates}::text[]) AS handle`,
  );
  return rows.map((row) => row.handle);
}

export type ChangeHandleResult = "ok" | "unchanged" | "taken" | "invalid" | "no-profile";

/** Braucht den Besitzerkontext. */
export async function changeHandle(newHandle: string): Promise<ChangeHandleResult> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ result: ChangeHandleResult }[]>`
      SELECT aeli_change_handle(${newHandle}) AS result`,
  );
  return rows[0]?.result ?? "no-profile";
}

// ---------------------------------------------------------------------------
// Community-Brücke
// ---------------------------------------------------------------------------

export async function tenantIsLive(tenantId: string): Promise<boolean> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ live: boolean }[]>`SELECT aeli_tenant_is_live(${tenantId}) AS live`,
  );
  return Boolean(rows[0]?.live);
}

/** Braucht den Besitzerkontext. */
export async function ownedTenants(): Promise<{ id: string; name: string }[]> {
  return queryAsAeliUser(
    (tx) => tx.$queryRaw<{ id: string; name: string }[]>`SELECT * FROM aeli_owned_tenants()`,
  );
}

// ---------------------------------------------------------------------------
// Auszahlung und Trinkgeld
// ---------------------------------------------------------------------------

export interface ProfilePayoutRow {
  stripeAccountId: string;
  source: "aeli" | "aera";
  communityName: string | null;
}

/** Veröffentlichtes Profil — oder das eigene im Besitzerkontext. */
export async function profilePayout(profileId: string): Promise<ProfilePayoutRow | null> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<ProfilePayoutRow[]>`SELECT * FROM aeli_profile_payout(${profileId})`,
  );
  return rows[0] ?? null;
}

/** Braucht den Besitzerkontext. */
export async function linkedCommunityPayoutRow(): Promise<{
  name: string;
  ownedByYou: boolean;
  hasStripe: boolean;
} | null> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ name: string; ownedByYou: boolean; hasStripe: boolean }[]>`
      SELECT * FROM aeli_linked_community_payout()`,
  );
  return rows[0] ?? null;
}

/** Braucht den Besitzerkontext. */
export async function connectPayoutAccountRow(id: string, stripeAccountId: string): Promise<boolean> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ ok: boolean }[]>`
      SELECT aeli_connect_payout_account(${id}, ${stripeAccountId}) AS ok`,
  );
  return Boolean(rows[0]?.ok);
}

/** Braucht den Besitzerkontext. */
export async function disconnectPayoutAccountRow(): Promise<number> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ count: number }[]>`SELECT aeli_disconnect_payout_account() AS count`,
  );
  return Number(rows[0]?.count ?? 0);
}

/** Legt die ausstehende Zahlung an; das Ziel bestimmt die Datenbank. */
export async function createTipRow(input: {
  id: string;
  profileId: string;
  blockId: string;
  amountCents: number;
  message: string;
  feeCents: number;
}): Promise<string | null> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ destination: string | null }[]>`
      SELECT aeli_create_tip(
        ${input.id}, ${input.profileId}, ${input.blockId},
        ${input.amountCents}::integer, ${input.message}, ${input.feeCents}::integer
      ) AS destination`,
  );
  return rows[0]?.destination ?? null;
}

export async function discardTipRow(id: string): Promise<void> {
  await queryAsAeliUser((tx) => tx.$queryRaw`SELECT aeli_discard_tip(${id}) AS ok`);
}

export async function markTipPaidRow(input: {
  tipId: string;
  sessionId: string;
  paymentIntentId: string | null;
  supporterEmail: string | null;
}): Promise<void> {
  await queryAsAeliUser(
    (tx) => tx.$queryRaw`
      SELECT aeli_mark_tip_paid(
        ${input.tipId}, ${input.sessionId}, ${input.paymentIntentId}, ${input.supporterEmail}
      ) AS count`,
  );
}

export async function markTipRefundedRow(paymentIntentId: string): Promise<void> {
  await queryAsAeliUser(
    (tx) => tx.$queryRaw`SELECT aeli_mark_tip_refunded(${paymentIntentId}) AS count`,
  );
}

// ---------------------------------------------------------------------------
// Öffentliche Seite
// ---------------------------------------------------------------------------

export async function countClick(blockId: string, profileId: string): Promise<void> {
  await queryAsAeliUser(
    (tx) => tx.$queryRaw`SELECT aeli_count_click(${blockId}, ${profileId}) AS count`,
  );
}

export type SubmitLeadResult = "created" | "duplicate" | "rejected";

export async function submitLead(input: {
  id: string;
  profileId: string;
  blockId: string | null;
  source: "NEWSLETTER" | "CONTACT" | "GATE";
  email: string;
  name?: string | null;
  message?: string | null;
}): Promise<SubmitLeadResult> {
  const rows = await queryAsAeliUser(
    (tx) => tx.$queryRaw<{ result: SubmitLeadResult }[]>`
      SELECT aeli_submit_lead(
        ${input.id}, ${input.profileId}, ${input.blockId}, ${input.source},
        ${input.email}, ${input.name ?? null}, ${input.message ?? null}
      ) AS result`,
  );
  return rows[0]?.result ?? "rejected";
}
