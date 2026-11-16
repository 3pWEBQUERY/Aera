import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * DB-backed check that writeAudit() really persists AuditLog rows through the
 * privileged SECURITY DEFINER function. writeAudit() swallows errors and only
 * logs them, so a broken call (e.g. a driver adapter that cannot deserialize
 * the function's `void` result) would otherwise go unnoticed.
 *
 * Runs against the CI Postgres (DATABASE_URL + CI=true, migrations and RLS
 * applied via `npm run db:predeploy`). Locally opt in with AERA_DB_TESTS=1.
 */
const enabled =
  Boolean(process.env.DATABASE_URL) &&
  (process.env.CI === "true" || process.env.AERA_DB_TESTS === "1");

describe.skipIf(!enabled)("writeAudit (database)", () => {
  const suffix = randomUUID().slice(0, 8);
  const tenantId = `audit-test-${suffix}`;
  const userId = `audit-test-user-${suffix}`;
  const actions: string[] = [];

  let prisma: typeof import("@/lib/prisma").systemPrisma;
  let writeAudit: typeof import("@/lib/audit").writeAudit;

  beforeAll(async () => {
    ({ systemPrisma: prisma } = await import("@/lib/prisma"));
    ({ writeAudit } = await import("@/lib/audit"));
    await prisma.user.create({
      data: {
        id: userId,
        email: `audit-test-${suffix}@aera.test`,
        passwordHash: "not-a-real-hash",
        name: "Audit Test",
      },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: `Audit Test ${suffix}`,
        slug: `audit-test-${suffix}`,
        ownerId: userId,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.auditLog.deleteMany({ where: { action: { in: actions } } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("persists a tenant-scoped audit row with actor, target and metadata", async () => {
    const errors = vi.spyOn(console, "error");
    const action = `test.audit.tenant.${suffix}`;
    actions.push(action);

    await writeAudit({
      tenantId,
      actorUserId: userId,
      action,
      targetType: "space",
      targetId: "space-123",
      metadata: { name: "General", nested: { visibility: "members" }, count: 2 },
    });

    expect(errors).not.toHaveBeenCalled();
    const rows = await prisma.auditLog.findMany({ where: { action } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId,
      actorUserId: userId,
      action,
      targetType: "space",
      targetId: "space-123",
      metadata: { name: "General", nested: { visibility: "members" }, count: 2 },
    });
  });

  it("persists a platform audit row (no tenant) with empty default metadata", async () => {
    const errors = vi.spyOn(console, "error");
    const action = `test.audit.platform.${suffix}`;
    actions.push(action);

    await writeAudit({ action });

    expect(errors).not.toHaveBeenCalled();
    const rows = await prisma.auditLog.findMany({ where: { action } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: null,
      actorUserId: null,
      targetType: null,
      targetId: null,
      metadata: {},
    });
  });
});
