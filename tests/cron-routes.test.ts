import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secret: "route-cron-secret-0123456789-0123456789",
  automations: vi.fn(),
  webhooks: vi.fn(),
  newsletters: vi.fn(),
  newsletterCampaigns: vi.fn(),
  posts: vi.fn(),
  inventory: vi.fn(),
  uploads: vi.fn(),
  lifecycle: vi.fn(),
  runCronRoute: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: mocks.secret } }));
vi.mock("@/lib/automations", () => ({ runAutomations: mocks.automations }));
vi.mock("@/lib/webhooks", () => ({
  processPendingWebhookDeliveries: mocks.webhooks,
}));
vi.mock("@/lib/newsletter-delivery", () => ({
  processPendingNewsletterDeliveries: mocks.newsletters,
  dispatchNewsletterCampaigns: mocks.newsletterCampaigns,
}));
vi.mock("@/lib/scheduled-posts", () => ({
  publishDueScheduledPosts: mocks.posts,
}));
vi.mock("@/lib/product-inventory", () => ({
  releaseExpiredProductReservations: mocks.inventory,
}));
vi.mock("@/lib/secure-upload", () => ({
  cleanupExpiredStorageReservations: mocks.uploads,
}));
vi.mock("@/lib/data-lifecycle", () => ({ runDataLifecycleJobs: mocks.lifecycle }));
vi.mock("@/lib/cron-monitor", () => ({ runCronRoute: mocks.runCronRoute }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  GET as automationsGet,
  POST as automationsPost,
} from "@/app/api/cron/automations/route";
import {
  GET as newslettersGet,
  POST as newslettersPost,
} from "@/app/api/cron/newsletters/route";
import { GET as postsGet, POST as postsPost } from "@/app/api/cron/posts/route";
import {
  GET as webhooksGet,
  POST as webhooksPost,
} from "@/app/api/cron/webhooks/route";
import {
  GET as inventoryGet,
  POST as inventoryPost,
} from "@/app/api/cron/inventory/route";
import { GET as uploadsGet, POST as uploadsPost } from "@/app/api/cron/uploads/route";
import {
  GET as lifecycleGet,
  POST as lifecyclePost,
} from "@/app/api/cron/lifecycle/route";

const routes = [
  ["automations", automationsPost, automationsGet],
  ["newsletters", newslettersPost, newslettersGet],
  ["posts", postsPost, postsGet],
  ["webhooks", webhooksPost, webhooksGet],
  ["inventory", inventoryPost, inventoryGet],
  ["uploads", uploadsPost, uploadsGet],
  ["lifecycle", lifecyclePost, lifecycleGet],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.automations.mockResolvedValue({ sent: 0, tenants: 0, queued: 0, failed: 0 });
  mocks.webhooks.mockResolvedValue({ claimed: 0, delivered: 0, failed: 0 });
  mocks.newsletters.mockResolvedValue({ claimed: 0, sent: 0, retrying: 0, exhausted: 0 });
  mocks.newsletterCampaigns.mockResolvedValue({ claimed: 0, queued: 0, completed: 0, failed: 0 });
  mocks.posts.mockResolvedValue({ published: 0, refs: [] });
  mocks.inventory.mockResolvedValue({ scanned: 0, released: 0 });
  mocks.uploads.mockResolvedValue(0);
  mocks.lifecycle.mockResolvedValue({
    jobsProcessed: 0,
    jobsCompleted: 0,
    jobsRetried: 0,
    objectsDeleted: 0,
    objectFailures: 0,
    orphanObjectsQueued: 0,
  });
  mocks.runCronRoute.mockImplementation(
    async (_job: string, handler: (context: { deadlineAt: number }) => Promise<object>) =>
      Response.json(
        { ok: true, ...(await handler({ deadlineAt: Date.now() + 40_000 })) },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      ),
  );
});

describe("all cron routes", () => {
  it.each(routes)("%s rejects unauthenticated POST requests", async (name, post) => {
    const response = await post(
      new Request(`https://aera.so/api/cron/${name}`, { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect([
      mocks.automations,
      mocks.webhooks,
      mocks.newsletters,
      mocks.newsletterCampaigns,
      mocks.posts,
      mocks.inventory,
      mocks.uploads,
      mocks.lifecycle,
    ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)).toBe(0);
  });

  it.each(routes)("%s accepts the configured bearer token", async (name, post) => {
    const response = await post(
      new Request(`https://aera.so/api/cron/${name}`, {
        method: "POST",
        headers: { authorization: `Bearer ${mocks.secret}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each(routes)("%s rejects state-changing GET requests", (name, _post, get) => {
    const response = get();
    expect(response.status, name).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("keeps newsletter and webhook work out of the automation route", async () => {
    const response = await automationsPost(
      new Request("https://aera.so/api/cron/automations", {
        method: "POST",
        headers: { authorization: `Bearer ${mocks.secret}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.automations).toHaveBeenCalledTimes(1);
    expect(mocks.webhooks).not.toHaveBeenCalled();
    expect(mocks.newsletters).not.toHaveBeenCalled();
    expect(mocks.newsletterCampaigns).not.toHaveBeenCalled();
  });
});
