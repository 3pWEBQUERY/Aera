import { vi } from "vitest";

/**
 * Minimal Prisma mock: every model delegate method used in the code under test
 * is a vi.fn(). Add models/methods here as new tests need them.
 */
export function createPrismaMock() {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    groupBy: vi.fn(),
  });

  return {
    user: model(),
    tenant: model(),
    membership: model(),
    membershipTier: model(),
    entitlement: model(),
    subscription: model(),
    order: model(),
    product: model(),
    mediaPackage: model(),
    gamificationRule: model(),
    pointsLedger: model(),
    memberStats: model(),
    badge: model(),
    badgeAward: model(),
    level: model(),
    post: model(),
    comment: model(),
    reaction: model(),
    space: model(),
    course: model(),
    lesson: model(),
    lessonProgress: model(),
    event: model(),
    knowledgeArticle: model(),
    newsletterCampaign: model(),
    newsletterDelivery: model(),
    emailEvent: model(),
    notification: model(),
    apiKey: model(),
    webhookEndpoint: model(),
    webhookDelivery: model(),
    referralConversion: model(),
    moderationFlag: model(),
    automationStep: model(),
    automationDelivery: model(),
    pushSubscription: model(),
    aiCreditWallet: model(),
    aiUsageEvent: model(),
    aiCreditPurchase: model(),
    stripeWebhookEvent: model(),
    auditLog: model(),
    // Tagged-template raw queries (used by credits.ts reserve/settle/release).
    $queryRaw: vi.fn(async (): Promise<unknown> => []),
    // $transaction supports both the array form (used by credits.ts) and the
    // callback form.
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMockRef.current);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;

/** Late-bound reference so $transaction's callback form sees the same mock. */
export const prismaMockRef: { current: PrismaMock | null } = { current: null };
