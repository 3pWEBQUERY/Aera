/**
 * Prüft, dass die Datenbank noch so abgesichert ist, wie die App es annimmt.
 *
 * Kein DDL — die Migration in
 * ../prisma/migrations/20260807120000_aeli_link_in_bio ist die einzige
 * Wahrheit. Dieses Skript stellt nur Fragen und meldet, wenn eine Antwort
 * nicht stimmt.
 *
 * Es prüft absichtlich auch die stillen Fehler: eine Rolle, die es gibt, deren
 * Mitgliedschaft aber fehlt, führt nicht zu einem Absturz — die App liefe dann
 * einfach als Eigentümer weiter, ganz ohne RLS, und niemand würde es merken.
 *
 *   npm run db:rls
 */
import { Client } from "pg";

const AELI_TABLES = [
  "AeliProfile",
  "AeliBlock",
  "AeliClick",
  "AeliLead",
  "AeliPayoutAccount",
  "AeliTip",
] as const;

/** Was `aeli_app` auf den Aeli-Tabellen genau dürfen soll — nicht mehr. */
const EXPECTED_GRANTS: Record<string, string[]> = {
  AeliProfile: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  AeliBlock: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  // Append-only: das Ereignis-Log wird nie umgeschrieben.
  AeliClick: ["SELECT", "INSERT"],
  // Leads darf der Creator löschen, aber nicht nachträglich ändern.
  AeliLead: ["SELECT", "INSERT", "DELETE"],
  // Geld: nur lesen. Angelegt und fortgeschrieben wird ueber die
  // privilegierte Verbindung, weil dafuer `Tenant.ownerId` noetig ist —
  // die Begruendung steht in der Migration 20260809120000_aeli_tips.
  AeliPayoutAccount: ["SELECT"],
  AeliTip: ["SELECT"],
};

/**
 * Aera-Tabellen, die `aeli_app` lesen darf — und die Spalten, die es dort
 * NICHT geben darf. Die Liste ist die eigentliche Aussage dieser Prüfung: eine
 * Policy kann man versehentlich zu weit fassen, eine fehlende Spalte nicht
 * versehentlich ausliefern.
 */
const FORBIDDEN_COLUMNS: [string, string[]][] = [
  // Der Zugang zum Termin ist nicht dasselbe wie der Termin.
  ["Event", ["meetingUrl"]],
  // Die Datei ist die Ware. Wer sie lesen kann, braucht nicht zu kaufen.
  ["Product", ["downloadUrl", "stripePriceId", "grantsEntitlementKey"]],
  ["Course", ["videoUrl", "streamUrl", "address"]],
  ["MembershipTier", ["stripePriceId", "appleProductId", "entitlementKey"]],
  ["Space", ["settings"]],
  // Das Auszahlungskonto der Community und wem sie gehoert: beides entscheidet
  // ueber Geld und bleibt der Rolle verschlossen. Gelesen wird es nur ueber die
  // privilegierte Verbindung in lib/payouts.ts.
  ["Tenant", ["stripeAccountId", "ownerId", "platformFeePercent"]],
];

/** Tabellen, auf die `aeli_app` überhaupt keinen Blick haben darf. */
const OFF_LIMITS = ["User", "Membership", "Post", "Order", "Subscription", "Entitlement"];

const EXPECTED_POLICIES: [string, string][] = [
  ["AeliProfile", "aeli_owner_profile"],
  ["AeliProfile", "aeli_public_profile"],
  ["AeliBlock", "aeli_owner_block"],
  ["AeliBlock", "aeli_public_block"],
  ["AeliClick", "aeli_owner_event"],
  ["AeliClick", "aeli_public_event_insert"],
  ["AeliLead", "aeli_owner_lead"],
  ["AeliLead", "aeli_public_lead_insert"],
  ["Tenant", "aeli_public_tenant"],
  ["Space", "aeli_public_space"],
  ["Event", "aeli_public_event"],
  ["MembershipTier", "aeli_public_tier"],
  ["Product", "aeli_public_product"],
  ["Course", "aeli_public_course"],
  ["AeliPayoutAccount", "aeli_owner_payout"],
  ["AeliTip", "aeli_owner_tip"],
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt");

  const client = new Client({ connectionString: url });
  await client.connect();
  const failures: string[] = [];

  try {
    // --- Rolle ------------------------------------------------------------
    const role = await client.query<{
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
    }>(
      `SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
       FROM pg_roles WHERE rolname = 'aeli_app'`,
    );
    const attrs = role.rows[0];
    if (!attrs) {
      failures.push("Rolle aeli_app fehlt");
    } else if (Object.values(attrs).some(Boolean)) {
      failures.push(`Rolle aeli_app hat unsichere Attribute: ${JSON.stringify(attrs)}`);
    }

    const membership = await client.query<{ can_set_role: boolean }>(
      `SELECT pg_has_role(current_user, 'aeli_app', 'MEMBER') AS can_set_role`,
    );
    if (!membership.rows[0]?.can_set_role) {
      failures.push(
        "Die Rolle aus DATABASE_URL darf kein SET ROLE aeli_app — die App liefe ohne RLS weiter",
      );
    }

    // --- RLS aktiv --------------------------------------------------------
    for (const table of AELI_TABLES) {
      const state = await client.query<{ relrowsecurity: boolean }>(
        `SELECT c.relrowsecurity FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = $1`,
        [table],
      );
      if (!state.rows[0]) failures.push(`${table}: Tabelle fehlt`);
      else if (!state.rows[0].relrowsecurity) failures.push(`${table}: RLS ist nicht aktiv`);
    }

    // --- Policies ---------------------------------------------------------
    for (const [table, policy] of EXPECTED_POLICIES) {
      const exists = await client.query<{ found: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_policies
           WHERE schemaname = 'public' AND tablename = $1 AND policyname = $2
         ) AS found`,
        [table, policy],
      );
      if (!exists.rows[0]?.found) failures.push(`${table}: Policy ${policy} fehlt`);
    }

    // Die Besitzer-Policies müssen am GUC hängen. Eine Policy, die den GUC
    // nicht erwähnt, ist entweder wirkungslos oder viel zu weit — beides
    // wollen wir hören.
    const gucPolicies = await client.query<{ tablename: string; policyname: string; qual: string | null }>(
      `SELECT tablename, policyname, qual FROM pg_policies
       WHERE schemaname = 'public' AND policyname LIKE 'aeli_owner_%'`,
    );
    for (const row of gucPolicies.rows) {
      if (!row.qual?.includes("aeli.user_id")) {
        failures.push(`${row.tablename}: ${row.policyname} prüft nicht aeli.user_id`);
      }
    }

    // --- Grants -----------------------------------------------------------
    const grants = await client.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type
       FROM information_schema.role_table_grants
       WHERE grantee = 'aeli_app' AND table_schema = 'public'`,
    );
    const actual = new Map<string, Set<string>>();
    for (const row of grants.rows) {
      if (!actual.has(row.table_name)) actual.set(row.table_name, new Set());
      actual.get(row.table_name)!.add(row.privilege_type);
    }

    for (const [table, expected] of Object.entries(EXPECTED_GRANTS)) {
      const found = actual.get(table) ?? new Set<string>();
      for (const privilege of expected) {
        if (!found.has(privilege)) failures.push(`${table}: ${privilege} fehlt für aeli_app`);
      }
      for (const privilege of found) {
        if (!expected.includes(privilege)) {
          failures.push(`${table}: unerwartetes ${privilege} für aeli_app`);
        }
      }
    }

    // Alles, was nicht in der Liste steht, darf aeli_app auf Tabellenebene
    // gar nicht sehen. `Tenant` und die fünf Aera-Inhaltstabellen sind die
    // Ausnahme — bei ihnen gibt es nur Spalten-Grants, und die stehen nicht in
    // `role_table_grants`.
    for (const [table] of actual) {
      if (!(table in EXPECTED_GRANTS)) {
        failures.push(`${table}: aeli_app hat unerwartete Tabellenrechte`);
      }
    }

    // --- Aera-Inhalte: lesen ja, schreiben nie ----------------------------
    for (const [table] of FORBIDDEN_COLUMNS) {
      for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
        const allowed = await client.query<{ allowed: boolean }>(
          `SELECT has_table_privilege('aeli_app', format('public.%I', $1::text), $2) AS allowed`,
          [table, privilege],
        );
        if (allowed.rows[0]?.allowed) {
          failures.push(`${table}: aeli_app darf ${privilege} — das ist ein reiner Lesepfad`);
        }
      }
    }

    for (const [table, columns] of FORBIDDEN_COLUMNS) {
      for (const column of columns) {
        const allowed = await client.query<{ allowed: boolean }>(
          `SELECT has_column_privilege('aeli_app', format('public.%I', $1::text), $2, 'SELECT') AS allowed`,
          [table, column],
        );
        if (allowed.rows[0]?.allowed) {
          failures.push(`${table}.${column}: aeli_app soll diese Spalte nicht lesen können`);
        }
      }
    }

    for (const table of OFF_LIMITS) {
      const any = await client.query<{ any_column: boolean }>(
        `SELECT bool_or(has_column_privilege('aeli_app', format('public.%I', $1::text), column_name, 'SELECT')) AS any_column
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      if (any.rows[0]?.any_column) {
        failures.push(`${table}: aeli_app kann Spalten lesen — diese Tabelle ist tabu`);
      }
    }

  } finally {
    await client.end();
  }

  if (failures.length > 0) {
    console.error("❌ Aeli-RLS stimmt nicht:");
    for (const failure of failures) console.error(`   · ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `✅ Aeli-RLS geprüft: Rolle aeli_app, ${EXPECTED_POLICIES.length} Policies, ` +
      `Aera-Inhalte nur lesend, ${OFF_LIMITS.length} Tabellen tabu.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
