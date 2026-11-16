import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";
import type { Prisma } from "@/app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

/**
 * Tenant context for Postgres Row Level Security.
 *
 * The RLS policies (see prisma/security/rls.sql, scripts/apply-rls.ts) check
 * `current_setting('aera.tenant_id', true)`. Every model query issued while a
 * tenant context is active is wrapped in a transaction that first runs
 * `SET LOCAL ROLE aera_app` and sets this GUC, so the database enforces tenant
 * isolation as defense-in-depth on top of the application-level
 * `where: { tenantId }` scoping. Without a context the query runs on the
 * privileged connection (system paths, global identity lookups).
 *
 * The context is SCOPED, never "set". There is deliberately no
 * `enterWith`-style setter: a store entered inside an awaited helper (a guard,
 * a resolver) does not survive the `await` in the caller, whose continuation
 * resumes in the context captured before the call. That silently ran every
 * query after `await requireTenantAdmin(slug)` as the table owner, bypassing
 * RLS. So the only way in is `withTenantContext(tenantId, fn)`, visible at the
 * call site:
 *
 *   const { tenant, user } = await requireTenantAdmin(slug);
 *   return withTenantContext(tenant.id, async () => {
 *     ... every query in here runs as aera_app for this tenant ...
 *   });
 *
 * The store lives on `globalThis` so the extended client cached there across
 * dev hot reloads keeps reading the same store that `withTenantContext`
 * writes; a per-module store would silently disable RLS after a reload.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
  prismaBase?: PrismaClient;
  aeraTenantALS?: AsyncLocalStorage<string>;
};

const tenantALS = (globalForPrisma.aeraTenantALS ??= new AsyncLocalStorage<string>());

/**
 * Run `fn` with an explicit tenant context. Use it right after a guard or
 * resolver has authorized the tenant (actions, pages, API routes), and in
 * webhooks or background jobs that receive a tenant id.
 */
export function withTenantContext<T>(tenantId: string, fn: () => T | Promise<T>): Promise<T> {
  if (!tenantId) throw new Error("withTenantContext requires a tenant id");
  // Await inside the ALS scope so lazy PrismaPromise execution cannot escape
  // the tenant context before the query extension reads it.
  return tenantALS.run(tenantId, async () => await fn());
}

/** The active tenant id, or undefined on the privileged/system path. */
export function currentTenantContext(): string | undefined {
  return tenantALS.getStore();
}

function createBaseClient() {
  const adapter = new PrismaPg({ connectionString: connectionString! });
  return new PrismaClient({ adapter });
}

/** `SET LOCAL` lasts until the end of the transaction, so both go first. */
async function enterTenantRole(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  await tx.$executeRawUnsafe("SET LOCAL ROLE aera_app");
  await tx.$executeRaw`SELECT set_config('aera.tenant_id', ${tenantId}, TRUE)`;
}

function createClient(base: PrismaClient) {
  const extended = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const tenantId = tenantALS.getStore();
          if (!tenantId) return query(args);
          return base.$transaction(async (tx) => {
            await enterTenantRole(tx, tenantId);
            const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
            const delegate = (tx as unknown as Record<string, Record<string, (value: unknown) => unknown>>)[delegateName];
            const method = delegate?.[operation];
            if (!method) throw new Error(`Unsupported tenant Prisma operation: ${model}.${operation}`);
            return method.call(delegate, args);
          });
        },
      },
    },
  });

  // Inside a tenant context every model operation opens its own transaction
  // (above), so `prisma.$transaction([...])` would silently lose atomicity and
  // an interactive `prisma.$transaction(fn)` would run outside the RLS role.
  // Route interactive transactions through the tenant role and refuse batches.
  const originalTransaction = extended.$transaction.bind(extended) as (...args: unknown[]) => unknown;
  return new Proxy(extended, {
    get(target, prop, receiver) {
      if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
      return (arg: unknown, options?: unknown) => {
        const tenantId = tenantALS.getStore();
        if (!tenantId) return originalTransaction(arg, options);
        if (typeof arg === "function") {
          return withTenantTransaction(arg as (tx: Prisma.TransactionClient) => Promise<unknown>);
        }
        throw new Error(
          "prisma.$transaction([...]) is not atomic inside a tenant context; use withTenantTransaction(async (tx) => ...) instead",
        );
      };
    },
  });
}

/** Execute related writes atomically under the same tenant RLS role/GUC. */
export async function withTenantTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const tenantId = tenantALS.getStore();
  if (!tenantId) return baseClient.$transaction(fn);
  return baseClient.$transaction(async (tx) => {
    await enterTenantRole(tx, tenantId);
    return fn(tx);
  });
}

/**
 * Tenant transaction for library/background code that receives a tenant id
 * explicitly and must not rely on a caller having opened a tenant scope.
 */
export function withTenantTransactionFor<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return tenantALS.run(tenantId, () => withTenantTransaction(fn));
}

type ExtendedPrismaClient = ReturnType<typeof createClient>;

const baseClient = globalForPrisma.prismaBase ?? createBaseClient();
/**
 * Explicit privileged client for the small set of global identity/inbox/admin
 * paths. Tenant feature code must use the extended default client instead.
 */
export const systemPrisma = baseClient;
export const prisma: ExtendedPrismaClient = globalForPrisma.prisma ?? createClient(baseClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaBase = baseClient;
}

export default prisma;
