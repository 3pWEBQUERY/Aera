/**
 * Verifies the RLS installation created by Prisma migrations.
 *
 * This script intentionally performs no DDL. The migration is the single
 * source of truth, so production cannot drift between `prisma migrate deploy`
 * and a later imperative policy setup. Run `npm run db:deploy` first.
 */
import "dotenv/config";
import { Client } from "pg";
import {
  COLUMN_PRIVILEGES,
  PRIVILEGED_FUNCTIONS,
  PRIVILEGED_ONLY_TENANT_TABLES,
  SUPPORTING_TABLE_PRIVILEGES,
  TENANT_CRUD_TABLES,
  TENANT_FUNCTIONS,
  TENANT_READ_ONLY_TABLES,
  TENANT_RLS_TABLES,
  TENANT_TABLE_PRIVILEGES,
} from "./rls-config";

const DML_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const failures: string[] = [];
    const role = await client.query<{
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolinherit: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit,
              rolreplication, rolbypassrls
       FROM pg_roles WHERE rolname = 'aera_app'`,
    );

    const attrs = role.rows[0];
    if (!attrs) {
      failures.push("role aera_app is missing");
    } else if (Object.values(attrs).some(Boolean)) {
      failures.push(`role aera_app has unsafe attributes: ${JSON.stringify(attrs)}`);
    }

    const membership = await client.query<{ can_set_role: boolean }>(
      `SELECT pg_has_role(current_user, 'aera_app', 'MEMBER') AS can_set_role`,
    );
    if (!membership.rows[0]?.can_set_role) {
      failures.push("DATABASE_URL role cannot SET ROLE aera_app");
    }

    for (const table of TENANT_RLS_TABLES) {
      const result = await client.query<{
        relrowsecurity: boolean;
        qual: string | null;
        with_check: string | null;
      }>(
        `SELECT c.relrowsecurity, p.qual, p.with_check
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_policies p
           ON p.schemaname = n.nspname
          AND p.tablename = c.relname
          AND p.policyname = 'tenant_isolation'
         WHERE n.nspname = 'public' AND c.relname = $1`,
        [table],
      );
      const state = result.rows[0];
      if (!state?.relrowsecurity) failures.push(`${table}: RLS is not enabled`);
      if (
        !state?.qual?.includes("aera.tenant_id") ||
        !state.with_check?.includes("aera.tenant_id")
      ) {
        failures.push(`${table}: tenant_isolation policy is missing or incomplete`);
      }
    }

    for (const [table, policy] of [
      ["Tenant", "tenant_self"],
      ["AssistantMessage", "tenant_parent_isolation"],
      ["PushSubscription", "tenant_user_isolation"],
    ] as const) {
      const result = await client.query<{ relrowsecurity: boolean; policy_exists: boolean }>(
        `SELECT c.relrowsecurity,
                EXISTS (
                  SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = 'public'
                    AND p.tablename = c.relname
                    AND p.policyname = $2
                    AND p.qual LIKE '%aera.tenant_id%'
                    AND p.with_check LIKE '%aera.tenant_id%'
                ) AS policy_exists
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = $1`,
        [table, policy],
      );
      if (!result.rows[0]?.relrowsecurity || !result.rows[0]?.policy_exists) {
        failures.push(`${table}: ${policy} RLS policy is missing or incomplete`);
      }
    }

    const userPolicies = await client.query<{
      relrowsecurity: boolean;
      select_policy: boolean;
      update_policy: boolean;
    }>(
      `SELECT c.relrowsecurity,
              EXISTS (
                SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = 'User'
                  AND p.policyname = 'tenant_member_users_select'
                  AND p.qual LIKE '%aera.tenant_id%'
              ) AS select_policy,
              EXISTS (
                SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = 'User'
                  AND p.policyname = 'tenant_member_users_update'
                  AND p.qual LIKE '%aera.tenant_id%'
                  AND p.with_check LIKE '%aera.tenant_id%'
              ) AS update_policy
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'User'`,
    );
    const userState = userPolicies.rows[0];
    if (!userState?.relrowsecurity || !userState.select_policy || userState.update_policy) {
      failures.push("User: tenant SELECT policy is missing or an unsafe UPDATE policy exists");
    }

    const expected = new Map<string, Set<string>>();
    expected.set("Tenant", new Set(TENANT_TABLE_PRIVILEGES));
    for (const table of TENANT_CRUD_TABLES) {
      expected.set(table, new Set(DML_PRIVILEGES));
    }
    for (const table of TENANT_READ_ONLY_TABLES) {
      expected.set(table, new Set(["SELECT"]));
    }
    for (const [table, privileges] of Object.entries(SUPPORTING_TABLE_PRIVILEGES)) {
      expected.set(table, new Set(privileges));
    }

    const grants = await client.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type
       FROM information_schema.role_table_grants
       WHERE grantee = 'aera_app' AND table_schema = 'public'`,
    );
    const actual = new Map<string, Set<string>>();
    for (const grant of grants.rows) {
      const privileges = actual.get(grant.table_name) ?? new Set<string>();
      privileges.add(grant.privilege_type);
      actual.set(grant.table_name, privileges);
    }

    for (const [table, privileges] of expected) {
      const actualPrivileges = actual.get(table) ?? new Set<string>();
      for (const privilege of privileges) {
        if (!actualPrivileges.has(privilege)) failures.push(`${table}: missing ${privilege} grant`);
      }
      for (const privilege of actualPrivileges) {
        if (!privileges.has(privilege)) failures.push(`${table}: unexpected ${privilege} grant`);
      }
    }
    for (const [table, privileges] of actual) {
      if (!expected.has(table) && privileges.size > 0) {
        failures.push(`${table}: unexpected aera_app table grants`);
      }
    }
    for (const table of PRIVILEGED_ONLY_TENANT_TABLES) {
      if ((actual.get(table)?.size ?? 0) > 0) {
        failures.push(`${table}: privileged-only table is granted to aera_app`);
      }
    }

    for (const [table, privilegeMap] of Object.entries(COLUMN_PRIVILEGES)) {
      const columns = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      for (const privilege of ["SELECT", "UPDATE"] as const) {
        const allowed = new Set<string>(
          privilege in privilegeMap
            ? [...(privilegeMap[privilege as keyof typeof privilegeMap] ?? [])]
            : [],
        );
        for (const { column_name: column } of columns.rows) {
          // Tenant has a deliberate table-level SELECT grant. Its column map
          // only constrains UPDATE; User SELECT/UPDATE are both constrained.
          if (table === "Tenant" && privilege === "SELECT") continue;
          const result = await client.query<{ allowed: boolean }>(
            `SELECT has_column_privilege('aera_app', $1, $2, $3) AS allowed`,
            [`"public"."${table.replaceAll('"', '""')}"`, column, privilege],
          );
          const actualAllowed = Boolean(result.rows[0]?.allowed);
          if (actualAllowed !== allowed.has(column)) {
            failures.push(
              `${table}.${column}: ${privilege} must be ${allowed.has(column) ? "granted" : "revoked"}`,
            );
          }
        }
      }
    }

    for (const signature of TENANT_FUNCTIONS) {
      const result = await client.query<{ allowed: boolean }>(
        `SELECT has_function_privilege('aera_app', $1, 'EXECUTE') AS allowed`,
        [signature],
      );
      if (!result.rows[0]?.allowed) failures.push(`${signature}: aera_app cannot execute`);
    }
    for (const signature of PRIVILEGED_FUNCTIONS) {
      const result = await client.query<{ allowed: boolean }>(
        `SELECT has_function_privilege('aera_app', $1, 'EXECUTE') AS allowed`,
        [signature],
      );
      if (result.rows[0]?.allowed) failures.push(`${signature}: exposed to aera_app`);
    }

    if (failures.length > 0) {
      throw new Error(
        `RLS migration is missing or drifted:\n- ${failures.join("\n- ")}\n` +
          "Run `npm run db:deploy`; never repair production policies ad hoc.",
      );
    }

    console.log(
      `✅ RLS migration verified: ${TENANT_RLS_TABLES.length + 4} policies, least-privilege aera_app grants, platform audit boundary.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("RLS verification failed:", error);
  process.exit(1);
});
