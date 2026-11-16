/**
 * Integration test against a real Postgres (CI service, see
 * .github/workflows/ci.yml): after a guard resolves the tenant, queries in the
 * caller's scope really run as `aera_app` with `aera.tenant_id` set, so the
 * RLS policies apply.
 *
 * Regression for the `enterWith` bug: `setTenantContext()` inside the awaited
 * guard left the caller's continuation without a store, so every query after
 * `await requireTenantAdmin(slug)` ran as the privileged owner role.
 *
 * The second suite drives real server actions and records, with a temporary
 * Postgres trigger, which role and GUC their writes actually ran under.
 *
 * Runs only against a local CI/test database (same rule as scripts/seed-ci.ts)
 * and creates and removes its own fixtures. Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ current: null as null | { id: string } }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => viewer.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function isLocalTestDatabase(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const database = url.pathname.slice(1).toLowerCase();
    return (
      ["127.0.0.1", "localhost", "postgres"].includes(url.hostname) &&
      /(?:^|[_-])(ci|test)(?:$|[_-])/.test(database)
    );
  } catch {
    return false;
  }
}

const enabled = isLocalTestDatabase(process.env.DATABASE_URL);
if (!enabled && process.env.AERA_REQUIRE_DB_TESTS === "1") {
  throw new Error("AERA_REQUIRE_DB_TESTS=1 but DATABASE_URL is not a local CI/test database");
}

type Session = { current_user: string; tenant_id: string | null };

describe.skipIf(!enabled)("tenant RLS context after guards (Postgres)", async () => {
  const { default: prisma, systemPrisma, withTenantContext, withTenantTransaction, currentTenantContext } =
    await import("@/lib/prisma");
  const { requireTenantAdmin, getCommunityContext } = await import("@/lib/guards");

  const run = randomUUID().slice(0, 8);
  const adminId = randomUUID();
  const tenantA = { id: randomUUID(), slug: `rls-guard-a-${run}` };
  const tenantB = { id: randomUUID(), slug: `rls-guard-b-${run}` };

  /** Session state of a statement issued from the current async context. */
  const session = () =>
    withTenantTransaction(async (tx) => {
      const rows = await tx.$queryRaw<Session[]>`
        SELECT current_user::text AS current_user,
               NULLIF(current_setting('aera.tenant_id', true), '') AS tenant_id
      `;
      return rows[0]!;
    });

  beforeAll(async () => {
    await systemPrisma.user.create({
      data: {
        id: adminId,
        email: `rls-guard-${run}@aera.test`,
        passwordHash: "integration-test-not-a-login-hash",
        name: "RLS Guard Admin",
        emailVerifiedAt: new Date(),
      },
    });
    for (const tenant of [tenantA, tenantB]) {
      await systemPrisma.tenant.create({
        data: {
          id: tenant.id,
          name: `RLS Guard ${tenant.slug}`,
          slug: tenant.slug,
          subdomain: tenant.slug,
          ownerId: adminId,
        },
      });
      await systemPrisma.space.create({
        data: { tenantId: tenant.id, name: "General", slug: "general", type: "FEED" },
      });
    }
    // Admin of A only; B is a foreign tenant for this user.
    await systemPrisma.membership.create({
      data: { tenantId: tenantA.id, userId: adminId, role: "ADMIN", status: "ACTIVE" },
    });
    viewer.current = { id: adminId };
  });

  afterAll(async () => {
    viewer.current = null;
    await systemPrisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    await systemPrisma.user.deleteMany({ where: { id: adminId } });
    await systemPrisma.$disconnect();
  });

  it("runs as the privileged owner without a tenant context (baseline)", async () => {
    const state = await session();
    expect(state.current_user).not.toBe("aera_app");
    expect(state.tenant_id).toBeNull();
  });

  it("applies RLS to queries issued after requireTenantAdmin returns", async () => {
    const { tenant } = await requireTenantAdmin(tenantA.slug);

    await withTenantContext(tenant.id, async () => {
      expect(currentTenantContext()).toBe(tenantA.id);
      expect(await session()).toEqual({ current_user: "aera_app", tenant_id: tenantA.id });

      // Model queries go through the client extension: even an unscoped
      // `where` can only see the guarded tenant's rows.
      const tenants = await prisma.tenant.findMany({
        where: { id: { in: [tenantA.id, tenantB.id] } },
        select: { id: true },
      });
      expect(tenants).toEqual([{ id: tenantA.id }]);
      const spaces = await prisma.space.findMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
        select: { tenantId: true },
      });
      expect(spaces).toEqual([{ tenantId: tenantA.id }]);

      // WITH CHECK rejects writes into another tenant.
      await expect(
        prisma.space.create({
          data: { tenantId: tenantB.id, name: "Injected", slug: `injected-${run}`, type: "FEED" },
        }),
      ).rejects.toThrow();
    });
    expect(await systemPrisma.space.count({ where: { tenantId: tenantB.id } })).toBe(1);
  });

  it("does not leave a hidden tenant context behind after the guard", async () => {
    await requireTenantAdmin(tenantA.slug);
    // Scoping is explicit at the call site; nothing leaks out of the guard.
    expect(currentTenantContext()).toBeUndefined();
    expect((await session()).current_user).not.toBe("aera_app");
  });

  it("refuses a tenant the user is not staff of", async () => {
    await expect(requireTenantAdmin(tenantB.slug)).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("applies RLS after getCommunityContext and builds the access context under RLS", async () => {
    const community = await getCommunityContext(tenantA.slug);
    expect(community?.tenant.id).toBe(tenantA.id);
    expect(community?.ctx.isStaff).toBe(true);

    await withTenantContext(community!.tenant.id, async () => {
      expect(await session()).toEqual({ current_user: "aera_app", tenant_id: tenantA.id });
      const visible = await prisma.space.count({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
      });
      expect(visible).toBe(1);
    });
  });

  it("keeps prisma.$transaction atomic and RLS-scoped inside a tenant context", async () => {
    await withTenantContext(tenantA.id, async () => {
      const state = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Session[]>`
          SELECT current_user::text AS current_user,
                 NULLIF(current_setting('aera.tenant_id', true), '') AS tenant_id
        `;
        return rows[0]!;
      });
      expect(state).toEqual({ current_user: "aera_app", tenant_id: tenantA.id });

      // A batch would run each operation in its own transaction.
      expect(() => prisma.$transaction([prisma.space.count()])).toThrow(/not atomic/);
    });
  });
});

/**
 * Real server actions, observed from inside Postgres: a temporary trigger
 * logs `current_user` and `aera.tenant_id` for every write to the probed
 * tables of the fixture tenant. This is the end-to-end proof that the code
 * after a guard (not just the guard itself) runs under RLS.
 */
describe.skipIf(!enabled)("server actions write under RLS after their guard (Postgres)", async () => {
  const { systemPrisma } = await import("@/lib/prisma");
  const { saveSpaceLinkAction } = await import("@/app/actions/links");
  const { rsvpEventAction } = await import("@/app/actions/engage");

  const run = randomUUID().slice(0, 8);
  const probe = `rls_probe_${run}`;
  const userId = randomUUID();
  const tenant = { id: randomUUID(), slug: `rls-action-${run}` };
  const ids = { links: randomUUID(), events: randomUUID(), event: randomUUID() };

  type Write = { table: string; role: string; tenant_id: string | null; row_tenant: string };
  const writes = () =>
    systemPrisma.$queryRawUnsafe<Write[]>(
      `SELECT "table", "role", "tenant_id", "row_tenant" FROM "${probe}"."log" ORDER BY "at"`,
    );

  beforeAll(async () => {
    await systemPrisma.user.create({
      data: {
        id: userId,
        email: `rls-action-${run}@aera.test`,
        passwordHash: "integration-test-not-a-login-hash",
        name: "RLS Action Owner",
        emailVerifiedAt: new Date(),
      },
    });
    await systemPrisma.tenant.create({
      data: { id: tenant.id, name: `RLS Action ${run}`, slug: tenant.slug, subdomain: tenant.slug, ownerId: userId },
    });
    await systemPrisma.membership.create({
      data: { tenantId: tenant.id, userId, role: "OWNER", status: "ACTIVE" },
    });
    await systemPrisma.space.createMany({
      data: [
        { id: ids.links, tenantId: tenant.id, name: "Links", slug: "links", type: "LINKS" },
        { id: ids.events, tenantId: tenant.id, name: "Events", slug: "events", type: "EVENTS" },
      ],
    });
    await systemPrisma.event.create({
      data: {
        id: ids.event,
        tenantId: tenant.id,
        spaceId: ids.events,
        title: "Probe",
        slug: "probe",
        startsAt: new Date(Date.now() + 86_400_000),
      },
    });

    // Probe schema outside "public", so the RLS grant verifier never sees it.
    const statements = [
      `CREATE SCHEMA "${probe}"`,
      `CREATE TABLE "${probe}"."log" ("at" timestamptz NOT NULL DEFAULT clock_timestamp(),
         "table" text NOT NULL, "role" text NOT NULL, "tenant_id" text, "row_tenant" text NOT NULL)`,
      `GRANT USAGE ON SCHEMA "${probe}" TO aera_app`,
      `GRANT INSERT ON "${probe}"."log" TO aera_app`,
      `CREATE FUNCTION "${probe}"."capture"() RETURNS trigger LANGUAGE plpgsql AS $fn$
       BEGIN
         INSERT INTO "${probe}"."log" ("table", "role", "tenant_id", "row_tenant")
         VALUES (TG_TABLE_NAME, current_user::text,
                 NULLIF(current_setting('aera.tenant_id', true), ''), NEW."tenantId");
         RETURN NEW;
       END
       $fn$`,
      ...["Space", "EventRsvp"].map(
        (table) =>
          `CREATE TRIGGER "${probe}" AFTER INSERT OR UPDATE ON public."${table}"
           FOR EACH ROW WHEN (NEW."tenantId" = '${tenant.id}')
           EXECUTE FUNCTION "${probe}"."capture"()`,
      ),
    ];
    for (const statement of statements) await systemPrisma.$executeRawUnsafe(statement);
    viewer.current = { id: userId };
  });

  afterAll(async () => {
    viewer.current = null;
    for (const table of ["Space", "EventRsvp"]) {
      await systemPrisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${probe}" ON public."${table}"`);
    }
    await systemPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${probe}" CASCADE`);
    await systemPrisma.tenant.deleteMany({ where: { id: tenant.id } });
    await systemPrisma.user.deleteMany({ where: { id: userId } });
    await systemPrisma.$disconnect();
  });

  it("dashboard action: requireTenantAdmin -> Space update runs as aera_app", async () => {
    const fd = new FormData();
    fd.set("tenant", tenant.slug);
    fd.set("spaceId", ids.links);
    fd.set("title", "Probe link");
    fd.set("url", "https://example.com");
    expect(await saveSpaceLinkAction({}, fd)).toEqual({ ok: true });

    const logged = (await writes()).filter((w) => w.table === "Space");
    expect(logged.length).toBeGreaterThan(0);
    for (const w of logged) {
      expect(w).toEqual({ table: "Space", role: "aera_app", tenant_id: tenant.id, row_tenant: tenant.id });
    }
  });

  it("community action: tenant resolver -> EventRsvp insert runs as aera_app", async () => {
    const fd = new FormData();
    fd.set("tenant", tenant.slug);
    fd.set("eventId", ids.event);
    await rsvpEventAction(fd);

    expect(await systemPrisma.eventRsvp.count({ where: { eventId: ids.event, userId } })).toBe(1);
    const logged = (await writes()).filter((w) => w.table === "EventRsvp");
    expect(logged).toEqual([
      { table: "EventRsvp", role: "aera_app", tenant_id: tenant.id, row_tenant: tenant.id },
    ]);
  });
});
