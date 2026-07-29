/**
 * Warum fallen die Live-Seiten aus?
 *
 * Sagt der Reihe nach, was zwischen Code und Datenbank auseinanderlaeuft:
 * welche Spalten die Tabelle hat, was Prisma ueber die Migration denkt, ob
 * die Rechte stimmen — und fuehrt am Ende genau die Abfrage aus, an der die
 * Seiten scheitern. Deren Fehlermeldung ist das, was in Production
 * unterdrueckt wird.
 *
 * Aufruf: npx tsx scripts/diagnose-live.ts
 */
import "dotenv/config";
import { Client } from "pg";

const EXPECTED = ["source", "ingest", "cfInputId", "cfReplayId"] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt (.env).");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  const host = new URL(url).host;
  console.log(`Datenbank: ${host}\n`);

  // 0. Ist das ueberhaupt die Datenbank, mit der die Anwendung arbeitet?
  // Railway gibt intern und ueber den Proxy verschiedene Adressen aus — die
  // Frage ist, ob dahinter dasselbe Postgres steht.
  const who = await client.query<{ db: string; ident: string }>(
    `SELECT current_database() AS db, system_identifier::text AS ident FROM pg_control_system()`,
  );
  console.log(
    `0) Datenbank "${who.rows[0]?.db}" (System-ID ${who.rows[0]?.ident})`,
  );
  const tenants = await client.query<{ slug: string; n: string }>(
    `SELECT slug, (SELECT count(*)::text FROM "Membership" m WHERE m."tenantId" = t.id) AS n
       FROM "Tenant" t ORDER BY t."createdAt" LIMIT 10`,
  );
  console.log(
    `   Communities: ${tenants.rows.map((r) => `${r.slug} (${r.n})`).join(", ") || "keine"}\n`,
  );

  // 1. Spalten
  const cols = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'LiveSession'
      ORDER BY column_name`,
  );
  const present = new Set(cols.rows.map((r) => r.column_name));
  console.log("1) Spalten von \"LiveSession\"");
  for (const c of EXPECTED) {
    console.log(`   ${present.has(c) ? "vorhanden " : "FEHLT     "} ${c}`);
  }
  console.log(`   (insgesamt ${present.size} Spalten)\n`);

  // 2. Enum-Typen
  const types = await client.query<{ typname: string; labels: string }>(
    `SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('LiveSource','LiveIngest')
      GROUP BY t.typname`,
  );
  console.log("2) Enum-Typen");
  if (types.rows.length === 0) console.log("   keine gefunden");
  for (const r of types.rows) console.log(`   ${r.typname}: ${r.labels}`);
  console.log();

  // 3. Migrationseintrag
  const mig = await client.query<{
    migration_name: string;
    finished_at: Date | null;
    rolled_back_at: Date | null;
    applied_steps_count: number;
  }>(
    `SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
       FROM "_prisma_migrations"
      WHERE migration_name LIKE '%live_source%'`,
  );
  console.log("3) Migration in _prisma_migrations");
  if (mig.rows.length === 0) console.log("   nicht eingetragen");
  for (const r of mig.rows) {
    console.log(
      `   ${r.migration_name}\n     fertig: ${r.finished_at ?? "nein"}` +
        `  zurueckgerollt: ${r.rolled_back_at ?? "nein"}  Schritte: ${r.applied_steps_count}`,
    );
  }
  console.log();

  // 4. Rechte der Anwendungsrolle
  const grants = await client.query<{ grantee: string; privilege_type: string }>(
    `SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'LiveSession'
      ORDER BY grantee, privilege_type`,
  );
  console.log("4) Rechte auf \"LiveSession\"");
  const byRole = new Map<string, string[]>();
  for (const g of grants.rows) {
    byRole.set(g.grantee, [...(byRole.get(g.grantee) ?? []), g.privilege_type]);
  }
  if (byRole.size === 0) console.log("   keine");
  for (const [role, privs] of byRole) console.log(`   ${role}: ${privs.join(", ")}`);
  console.log();

  // 5. Die Abfrage, an der die Seiten haengen
  console.log("5) Die Abfrage der Live-Seiten");
  try {
    const rows = await client.query(
      `SELECT id, title, status, source, ingest, "cfInputId", "cfReplayId"
         FROM "LiveSession" LIMIT 5`,
    );
    console.log(`   erfolgreich, ${rows.rowCount} Zeile(n)`);
    for (const r of rows.rows) console.log(`   ${JSON.stringify(r)}`);
  } catch (error) {
    console.log("   FEHLGESCHLAGEN:");
    console.log("   " + (error instanceof Error ? error.message : String(error)));
  }

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
