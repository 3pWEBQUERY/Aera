import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COLUMN_PRIVILEGES,
  PRIVILEGED_ONLY_TENANT_TABLES,
  SUPPORTING_TABLE_PRIVILEGES,
  TENANT_CRUD_TABLES,
  TENANT_READ_ONLY_TABLES,
  TENANT_RLS_TABLES,
  TENANT_TABLE_PRIVILEGES,
} from "../scripts/rls-config";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260719110000_rls_least_privilege/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
const migrationCorpus = readdirSync(migrationsDirectory)
  .filter(
    (name) =>
      /^\d{14}_[a-z0-9_]+$/.test(name) &&
      name >= "20260719110000_rls_least_privilege",
  )
  .map((name) =>
    readFileSync(new URL(`${name}/migration.sql`, migrationsDirectory), "utf8"),
  )
  .join("\n");

function tenantModelsFromSchema(): string[] {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    .filter((match) => /^\s*tenantId\s+/m.test(match[2]))
    .map((match) => match[1])
    .sort();
}

describe("RLS hardening migration", () => {
  it("tracks every current tenantId model", () => {
    expect([...TENANT_RLS_TABLES].sort()).toEqual(tenantModelsFromSchema());
    for (const table of TENANT_RLS_TABLES) {
      expect(migrationCorpus).toContain(table);
    }
  });

  it("gives each tenant table exactly one privilege class", () => {
    const classified = [
      ...TENANT_CRUD_TABLES,
      ...TENANT_READ_ONLY_TABLES,
      ...PRIVILEGED_ONLY_TENANT_TABLES,
    ];
    expect(new Set(classified).size).toBe(TENANT_RLS_TABLES.length);
    expect([...classified].sort()).toEqual([...TENANT_RLS_TABLES].sort());
    expect(TENANT_READ_ONLY_TABLES).toContain("AuditLog");
    expect(PRIVILEGED_ONLY_TENANT_TABLES).toContain("StripeWebhookEvent");
  });

  it("removes blanket grants and protects cross-tenant functions", () => {
    expect(migration).toContain(
      "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM aera_app",
    );
    expect(migration).toContain(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM aera_app",
    );
    expect(migrationCorpus).toMatch(
      /REVOKE (?:ALL ON FUNCTION|EXECUTE ON FUNCTION) public\.aera_write_audit[\s\S]*?aera_app/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.aera_claim_webhook_deliveries\(INTEGER\)[\s\S]*?FROM PUBLIC, aera_app/,
    );
  });

  it("limits non-tenant support tables to the documented relations", () => {
    expect(SUPPORTING_TABLE_PRIVILEGES).toEqual({
      User: [],
      AssistantMessage: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      PushSubscription: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    });
    expect(migration).toContain(
      'CREATE POLICY tenant_parent_isolation ON public."AssistantMessage"',
    );
    expect(migration).toContain(
      'CREATE POLICY tenant_user_isolation ON public."PushSubscription"',
    );
    expect(migration).toContain(
      'CREATE POLICY tenant_member_users_select ON public."User"',
    );
    expect(migrationCorpus).toContain(
      'DROP POLICY IF EXISTS tenant_member_users_update ON public."User"',
    );
    expect(TENANT_TABLE_PRIVILEGES).toEqual(["SELECT"]);
    expect(COLUMN_PRIVILEGES.User.UPDATE).toEqual([]);
    expect(COLUMN_PRIVILEGES.User.SELECT).not.toContain("passwordHash");
    expect(COLUMN_PRIVILEGES.User.SELECT).not.toContain("totpSecret");
    expect(COLUMN_PRIVILEGES.Tenant.UPDATE).not.toContain("status");
    expect(COLUMN_PRIVILEGES.Tenant.UPDATE).not.toContain("platformFeePercent");
    expect(COLUMN_PRIVILEGES.Tenant.UPDATE).not.toContain("stripeAccountId");
    expect(COLUMN_PRIVILEGES.Tenant.UPDATE).not.toContain("customDomainVerifiedAt");
    expect(COLUMN_PRIVILEGES.Tenant.UPDATE).not.toContain("referralPercent");
    expect(migrationCorpus).toContain('REVOKE UPDATE ("name", "avatarUrl", "updatedAt")');
  });
});
