import { AsyncLocalStorage } from "node:async_hooks";
import { beforeAll, describe, expect, it } from "vitest";

// Next installs AsyncLocalStorage globally when its server boots; outside
// the server the shared stores are inert stubs. Provide it like Next does
// before the modules under test create their store instances.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

type WorkUnitStorage =
  typeof import("next/dist/server/app-render/work-unit-async-storage.external").workUnitAsyncStorage;
let workUnitAsyncStorage: WorkUnitStorage;
let activeTenantContext: typeof import("@/lib/prisma").activeTenantContext;
let setTenantContext: typeof import("@/lib/prisma").setTenantContext;
let withTenantContext: typeof import("@/lib/prisma").withTenantContext;

beforeAll(async () => {
  ({ workUnitAsyncStorage } = await import(
    "next/dist/server/app-render/work-unit-async-storage.external"
  ));
  ({ activeTenantContext, setTenantContext, withTenantContext } = await import("@/lib/prisma"));
});

/** Minimal stand-in for Next's per-request work unit store. */
function inRequest<T>(fn: () => Promise<T>): Promise<T> {
  const store = { type: "request" } as unknown as Parameters<
    typeof workUnitAsyncStorage.run
  >[0];
  return workUnitAsyncStorage.run(store, fn);
}

async function guardLike(tenantId: string): Promise<void> {
  // Guards resolve the tenant first and only then activate the context —
  // after an await, which is exactly where enterWith used to lose it on
  // Node 24 (AsyncContextFrame).
  await new Promise((resolve) => setTimeout(resolve, 1));
  setTenantContext(tenantId);
}

describe("tenant context per request", () => {
  it("is visible to the caller after an awaited guard", async () => {
    await inRequest(async () => {
      await guardLike("tenant-a");
      expect(activeTenantContext()).toBe("tenant-a");
    });
  });

  it("is shared by concurrent branches of the same request", async () => {
    await inRequest(async () => {
      let seenBySibling: string | undefined;
      await Promise.all([
        guardLike("tenant-a"),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          seenBySibling = activeTenantContext();
        })(),
      ]);
      expect(seenBySibling).toBe("tenant-a");
    });
  });

  it("does not leak into another request", async () => {
    await inRequest(async () => guardLike("tenant-a"));
    await inRequest(async () => {
      expect(activeTenantContext()).toBeUndefined();
    });
  });

  it("refuses to switch tenants within one request", async () => {
    await inRequest(async () => {
      await guardLike("tenant-a");
      expect(() => setTenantContext("tenant-b")).toThrow(/switch/);
      setTenantContext("tenant-a");
      expect(activeTenantContext()).toBe("tenant-a");
    });
  });

  it("lets an explicit scope take precedence over the request", async () => {
    await inRequest(async () => {
      await guardLike("tenant-a");
      await withTenantContext("tenant-b", async () => {
        expect(activeTenantContext()).toBe("tenant-b");
      });
      expect(activeTenantContext()).toBe("tenant-a");
    });
  });

  it("ignores cache scopes, which run detached from the user", async () => {
    const cacheStore = { type: "unstable-cache" } as unknown as Parameters<
      typeof workUnitAsyncStorage.run
    >[0];
    await inRequest(async () => {
      await guardLike("tenant-a");
      await workUnitAsyncStorage.run(cacheStore, async () => {
        expect(activeTenantContext()).toBeUndefined();
      });
    });
  });
});
