import { AsyncLocalStorage } from "node:async_hooks";
// Next keeps this store as a process-wide singleton (see
// next/dist/server/app-render/async-local-storage); reading it is side-effect
// free, unlike headers(), which would change how a route renders.
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/app/generated/prisma/client";
import type { Prisma } from "@/app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

/**
 * Tenant context for Postgres Row Level Security.
 *
 * The RLS policies (see prisma/security/rls.sql, scripts/apply-rls.ts) check
 * `current_setting('aera.tenant_id', true)`. Every query issued while a tenant
 * context is active is wrapped in a transaction that first sets this GUC, so
 * the database enforces tenant isolation as defense-in-depth on top of the
 * application-level `where: { tenantId }` scoping.
 *
 * Cross-tenant system queries run through the privileged connection. Whenever
 * a tenant context exists, the transaction first switches to `aera_app`, so
 * table-owner/superuser bypass no longer applies to tenant operations.
 */
const tenantALS = new AsyncLocalStorage<string>();

/**
 * Tenant context per incoming request.
 *
 * `setTenantContext` is called inside awaited helpers (guards such as
 * `requireTenantAdmin`, `getCommunityContext`). `AsyncLocalStorage.enterWith`
 * cannot carry a value from such a callee back to its caller on Node 24:
 * with AsyncContextFrame (the default since Node 24) the caller resumes in
 * the frame it captured at its own `await`, so the store set inside the guard
 * is gone and every following query silently ran as the privileged role —
 * RLS never applied. The context is therefore attached to Next's
 * request-scoped work unit store, which every server component, server
 * action and route handler of the same request shares. Outside a request
 * (scripts, workers) `enterWith` keeps the previous behaviour.
 */
const requestTenants = new WeakMap<object, string>();

function requestScope(): object | undefined {
  try {
    const store = workUnitAsyncStorage.getStore();
    // Only real requests. Cache scopes (`unstable_cache`, "use cache") and
    // prerendering run detached from the user and keep the privileged role.
    return store && store.type === "request" ? store : undefined;
  } catch {
    return undefined;
  }
}

/** Tenant of the current flow: explicit scopes first, then the request. */
function currentTenantId(): string | undefined {
  const scoped = tenantALS.getStore();
  if (scoped) return scoped;
  const scope = requestScope();
  return scope ? requestTenants.get(scope) : undefined;
}

/**
 * Activate the tenant context for the remainder of the current request.
 * Call this as soon as the tenant is resolved (guards, actions, API routes).
 * Explicit scopes (`withTenantContext`) always take precedence.
 */
export function setTenantContext(tenantId: string): void {
  const scope = requestScope();
  if (scope) {
    const previous = requestTenants.get(scope);
    if (previous && previous !== tenantId) {
      // One request acts for one community. Switching silently would apply
      // the second tenant's RLS identity to queries meant for the first.
      throw new Error("A request may not switch its tenant context.");
    }
    requestTenants.set(scope, tenantId);
    return;
  }
  tenantALS.enterWith(tenantId);
}

/** Tenant id the RLS layer currently applies (diagnostics and tests). */
export function activeTenantContext(): string | undefined {
  return currentTenantId();
}

/** Run `fn` with an explicit tenant context (e.g. webhooks, background jobs). */
export function withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  // Await inside the ALS scope so lazy PrismaPromise execution cannot escape
  // the tenant context before the query extension reads it.
  return tenantALS.run(tenantId, async () => await fn());
}

function createBaseClient() {
  const adapter = new PrismaPg({ connectionString: connectionString! });
  return new PrismaClient({ adapter });
}

function createClient(base: PrismaClient) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const tenantId = currentTenantId();
          if (!tenantId) return query(args);
          return base.$transaction(async (tx) => {
            await tx.$executeRawUnsafe("SET LOCAL ROLE aera_app");
            await tx.$executeRaw`SELECT set_config('aera.tenant_id', ${tenantId}, TRUE)`;
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
}

/** Execute related writes atomically under the same tenant RLS role/GUC. */
export async function withTenantTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const tenantId = currentTenantId();
  if (!tenantId) return baseClient.$transaction(fn);
  return baseClient.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE aera_app");
    await tx.$executeRaw`SELECT set_config('aera.tenant_id', ${tenantId}, TRUE)`;
    return fn(tx);
  });
}

/**
 * Tenant transaction for library/background code that receives a tenant id
 * explicitly and must not rely on a guard having populated AsyncLocalStorage.
 */
export function withTenantTransactionFor<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return tenantALS.run(tenantId, () => withTenantTransaction(fn));
}

type ExtendedPrismaClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
  prismaBase?: PrismaClient;
};

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
