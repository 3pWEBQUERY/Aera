import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { systemPrisma, withTenantTransactionFor } from "@/lib/prisma";

export const DATA_EXPORT_SCHEMA_VERSION = "2026-07-20.1";
const PAGE_SIZE = 250;

type JsonRow = Record<string, unknown>;

interface ExportRow {
  cursor: string;
  data: JsonRow;
}

interface Dataset {
  key: string;
  table?: string;
  redact?: string[];
  kind?: "tenant" | "members" | "assistantMessages" | "user";
  userColumns?: string[];
}

const TENANT_DATASETS: Dataset[] = [
  { key: "tenant", kind: "tenant" },
  { key: "members", kind: "members" },
  { key: "membershipTiers", table: "MembershipTier" },
  { key: "spaces", table: "Space" },
  { key: "memberRequests", table: "MemberRequest" },
  { key: "requestVotes", table: "RequestVote" },
  { key: "contentPlans", table: "ContentPlan" },
  { key: "contentPlanMedia", table: "ContentPlanMedia" },
  { key: "bookingSlots", table: "BookingSlot" },
  { key: "bookingReservations", table: "BookingReservation" },
  { key: "stories", table: "Story" },
  { key: "tips", table: "Tip" },
  { key: "mediaPackages", table: "MediaPackage" },
  { key: "mediaItems", table: "MediaItem" },
  { key: "posts", table: "Post" },
  { key: "comments", table: "Comment" },
  { key: "reactions", table: "Reaction" },
  { key: "courses", table: "Course" },
  { key: "lessons", table: "Lesson" },
  { key: "lessonProgress", table: "LessonProgress" },
  { key: "events", table: "Event" },
  { key: "eventRsvps", table: "EventRsvp" },
  { key: "products", table: "Product" },
  { key: "orders", table: "Order" },
  { key: "subscriptions", table: "Subscription" },
  { key: "entitlements", table: "Entitlement" },
  { key: "campaigns", table: "NewsletterCampaign" },
  { key: "segments", table: "Segment" },
  { key: "emailEvents", table: "EmailEvent" },
  {
    key: "newsletterDeliveries",
    table: "NewsletterDelivery",
    redact: ["unsubscribeUrl"],
  },
  { key: "newsletterConsents", table: "NewsletterConsent" },
  { key: "newsletterConsentEvents", table: "NewsletterConsentEvent" },
  { key: "emailSuppressions", table: "EmailSuppression" },
  { key: "gamificationRules", table: "GamificationRule" },
  { key: "pointsLedger", table: "PointsLedger" },
  { key: "badges", table: "Badge" },
  { key: "badgeAwards", table: "BadgeAward" },
  { key: "levels", table: "Level" },
  { key: "memberStats", table: "MemberStats" },
  { key: "mediaFolders", table: "MediaFolder" },
  { key: "storageObjects", table: "StorageObject" },
  { key: "storageUploadReservations", table: "StorageUploadReservation" },
  { key: "aiContextChunks", table: "AiContextChunk" },
  { key: "recommendations", table: "Recommendation" },
  { key: "liveSessions", table: "LiveSession" },
  { key: "liveChatMessages", table: "LiveChatMessage" },
  { key: "knowledgeArticles", table: "KnowledgeArticle" },
  { key: "auditLogs", table: "AuditLog" },
  { key: "conversations", table: "Conversation" },
  { key: "conversationMembers", table: "ConversationMember" },
  { key: "chatMessages", table: "ChatMessage" },
  { key: "assistantConversations", table: "AssistantConversation" },
  { key: "assistantMessages", kind: "assistantMessages" },
  { key: "aiCreditWallets", table: "AiCreditWallet" },
  { key: "pendingCreatorCheckouts", table: "PendingCreatorCheckout" },
  { key: "aiUsageEvents", table: "AiUsageEvent" },
  { key: "aiCreditPurchases", table: "AiCreditPurchase" },
  { key: "aiCreditReservations", table: "AiCreditReservation" },
  { key: "notifications", table: "Notification" },
  { key: "apiKeys", table: "ApiKey", redact: ["keyHash"] },
  { key: "webhookEndpoints", table: "WebhookEndpoint", redact: ["secret"] },
  { key: "webhookDeliveries", table: "WebhookDelivery" },
  { key: "moderationFlags", table: "ModerationFlag" },
  { key: "automationSteps", table: "AutomationStep" },
  {
    key: "automationDeliveries",
    table: "AutomationDelivery",
    redact: ["unsubscribeUrl"],
  },
  { key: "referralConversions", table: "ReferralConversion" },
];

const USER_DATASETS: Dataset[] = [
  { key: "user", kind: "user", redact: ["passwordHash", "totpSecret"] },
  { key: "ownedTenants", table: "Tenant", userColumns: ["ownerId"] },
  { key: "memberships", table: "Membership", userColumns: ["userId"] },
  { key: "posts", table: "Post", userColumns: ["authorId"] },
  { key: "comments", table: "Comment", userColumns: ["authorId"] },
  { key: "reactions", table: "Reaction", userColumns: ["userId"] },
  { key: "orders", table: "Order", userColumns: ["userId"] },
  { key: "subscriptions", table: "Subscription", userColumns: ["userId"] },
  { key: "entitlements", table: "Entitlement", userColumns: ["userId"] },
  { key: "pointsLedger", table: "PointsLedger", userColumns: ["userId"] },
  { key: "badgeAwards", table: "BadgeAward", userColumns: ["userId"] },
  { key: "memberStats", table: "MemberStats", userColumns: ["userId"] },
  { key: "lessonProgress", table: "LessonProgress", userColumns: ["userId"] },
  { key: "eventRsvps", table: "EventRsvp", userColumns: ["userId"] },
  { key: "liveChatMessages", table: "LiveChatMessage", userColumns: ["userId"] },
  { key: "recommendations", table: "Recommendation", userColumns: ["userId"] },
  { key: "emailEvents", table: "EmailEvent", userColumns: ["userId"] },
  { key: "storageObjects", table: "StorageObject", userColumns: ["ownerId"] },
  {
    key: "storageUploadReservations",
    table: "StorageUploadReservation",
    userColumns: ["ownerId"],
  },
  {
    key: "newsletterCampaigns",
    table: "NewsletterCampaign",
    userColumns: ["createdById"],
  },
  {
    key: "newsletterDeliveries",
    table: "NewsletterDelivery",
    userColumns: ["userId"],
    redact: ["unsubscribeUrl"],
  },
  { key: "newsletterConsents", table: "NewsletterConsent", userColumns: ["userId"] },
  {
    key: "newsletterConsentEvents",
    table: "NewsletterConsentEvent",
    userColumns: ["userId"],
  },
  { key: "emailSuppressions", table: "EmailSuppression", userColumns: ["userId"] },
  {
    key: "automationDeliveries",
    table: "AutomationDelivery",
    userColumns: ["userId"],
    redact: ["unsubscribeUrl"],
  },
  { key: "chatMessages", table: "ChatMessage", userColumns: ["userId"] },
  {
    key: "conversationMemberships",
    table: "ConversationMember",
    userColumns: ["userId"],
  },
  {
    key: "assistantConversations",
    table: "AssistantConversation",
    userColumns: ["userId"],
  },
  { key: "assistantMessages", kind: "assistantMessages" },
  { key: "memberRequests", table: "MemberRequest", userColumns: ["requesterId"] },
  { key: "requestVotes", table: "RequestVote", userColumns: ["userId"] },
  { key: "contentPlans", table: "ContentPlan", userColumns: ["createdById"] },
  {
    key: "bookingReservations",
    table: "BookingReservation",
    userColumns: ["userId"],
  },
  { key: "stories", table: "Story", userColumns: ["authorId"] },
  { key: "tips", table: "Tip", userColumns: ["userId"] },
  {
    key: "notifications",
    table: "Notification",
    userColumns: ["userId", "actorId"],
  },
  {
    key: "pushSubscriptions",
    table: "PushSubscription",
    userColumns: ["userId"],
    redact: ["endpoint", "p256dh", "auth"],
  },
  {
    key: "pendingCreatorCheckouts",
    table: "PendingCreatorCheckout",
    userColumns: ["userId"],
  },
  { key: "aiUsageEvents", table: "AiUsageEvent", userColumns: ["userId"] },
  {
    key: "aiCreditPurchases",
    table: "AiCreditPurchase",
    userColumns: ["userId"],
  },
  {
    key: "aiCreditReservations",
    table: "AiCreditReservation",
    userColumns: ["userId"],
  },
  {
    key: "referralConversions",
    table: "ReferralConversion",
    userColumns: ["referrerId", "referredId"],
  },
  {
    key: "moderationFlags",
    table: "ModerationFlag",
    userColumns: ["authorId", "resolvedById"],
  },
  { key: "auditLogs", table: "AuditLog", userColumns: ["actorUserId"] },
  { key: "legalAcceptances", table: "LegalAcceptance", userColumns: ["userId"] },
];

function sqlIdentifier(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error("Unsafe export registry identifier");
  }
  return `"${value}"`;
}

function redactionSql(fields: string[] = []): Prisma.Sql {
  if (!fields.length) return Prisma.empty;
  const values = fields.map((field) => `'${sqlIdentifier(field).slice(1, -1)}'`);
  return Prisma.raw(` - ARRAY[${values.join(",")}]::text[]`);
}

function jsonObject(value: Prisma.JsonValue): JsonRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRow)
    : { value };
}

async function tenantPage(
  tenantId: string,
  dataset: Dataset,
  cursor: string,
): Promise<ExportRow[]> {
  if (dataset.kind === "tenant") {
    if (cursor) return [];
    const rows = await systemPrisma.$queryRaw<Array<{ cursor: string; data: Prisma.JsonValue }>>(
      Prisma.sql`
        SELECT t.id AS cursor, to_jsonb(t) AS data
        FROM "Tenant" t
        WHERE t.id = ${tenantId}
        LIMIT 1
      `,
    );
    return rows.map((row) => ({ cursor: row.cursor, data: jsonObject(row.data) }));
  }
  if (dataset.kind === "members") {
    return withTenantTransactionFor(tenantId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ cursor: string; data: Prisma.JsonValue }>>(
        Prisma.sql`
          SELECT m.id AS cursor,
            to_jsonb(m) || jsonb_build_object(
              'user', jsonb_build_object(
                'id', u.id, 'email', u.email, 'name', u.name,
                'avatarUrl', u."avatarUrl",
                'emailVerifiedAt', u."emailVerifiedAt",
                'createdAt', u."createdAt", 'updatedAt', u."updatedAt"
              )
            ) AS data
          FROM "Membership" m
          JOIN "User" u ON u.id = m."userId"
          WHERE m."tenantId" = ${tenantId} AND m.id > ${cursor}
          ORDER BY m.id ASC
          LIMIT ${PAGE_SIZE}
        `,
      );
      return rows.map((row) => ({ cursor: row.cursor, data: jsonObject(row.data) }));
    });
  }
  if (dataset.kind === "assistantMessages") {
    return withTenantTransactionFor(tenantId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ cursor: string; data: Prisma.JsonValue }>>(
        Prisma.sql`
          SELECT m.id AS cursor, to_jsonb(m) AS data
          FROM "AssistantMessage" m
          JOIN "AssistantConversation" c ON c.id = m."conversationId"
          WHERE c."tenantId" = ${tenantId} AND m.id > ${cursor}
          ORDER BY m.id ASC
          LIMIT ${PAGE_SIZE}
        `,
      );
      return rows.map((row) => ({ cursor: row.cursor, data: jsonObject(row.data) }));
    });
  }
  const table = sqlIdentifier(dataset.table!);
  return withTenantTransactionFor(tenantId, async (tx) => {
    const rows = await tx.$queryRaw<Array<{ cursor: string; data: Prisma.JsonValue }>>(
      Prisma.sql`
        SELECT r.id AS cursor, to_jsonb(r)${redactionSql(dataset.redact)} AS data
        FROM ${Prisma.raw(table)} r
        WHERE r."tenantId" = ${tenantId} AND r.id > ${cursor}
        ORDER BY r.id ASC
        LIMIT ${PAGE_SIZE}
      `,
    );
    return rows.map((row) => ({ cursor: row.cursor, data: jsonObject(row.data) }));
  });
}

async function userPage(
  userId: string,
  dataset: Dataset,
  cursor: string,
): Promise<ExportRow[]> {
  if (dataset.kind === "user") {
    if (cursor) return [];
    const rows = await systemPrisma.$queryRaw<Array<{ cursor: string; data: Prisma.JsonValue }>>(
      Prisma.sql`
        SELECT u.id AS cursor, to_jsonb(u)${redactionSql(dataset.redact)} AS data
        FROM "User" u WHERE u.id = ${userId} LIMIT 1
      `,
    );
    return rows.map((row) => ({ cursor: row.cursor, data: jsonObject(row.data) }));
  }
  if (dataset.kind === "assistantMessages") {
    const rows = await systemPrisma.$queryRaw<Array<{ cursor: string; data: Prisma.JsonValue }>>(
      Prisma.sql`
        SELECT m.id AS cursor, to_jsonb(m) AS data
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        WHERE c."userId" = ${userId} AND m.id > ${cursor}
        ORDER BY m.id ASC LIMIT ${PAGE_SIZE}
      `,
    );
    return rows.map((row) => ({ cursor: row.cursor, data: jsonObject(row.data) }));
  }
  const table = sqlIdentifier(dataset.table!);
  const predicates = dataset.userColumns!.map((column) =>
    Prisma.sql`${Prisma.raw(`r.${sqlIdentifier(column)}`)} = ${userId}`,
  );
  const rows = await systemPrisma.$queryRaw<Array<{ cursor: string; data: Prisma.JsonValue }>>(
    Prisma.sql`
      SELECT r.id AS cursor, to_jsonb(r)${redactionSql(dataset.redact)} AS data
      FROM ${Prisma.raw(table)} r
      WHERE (${Prisma.join(predicates, " OR ")}) AND r.id > ${cursor}
      ORDER BY r.id ASC LIMIT ${PAGE_SIZE}
    `,
  );
  return rows.map((row) => ({ cursor: row.cursor, data: jsonObject(row.data) }));
}

function exportManifest(input: {
  scope: "tenant" | "user";
  subject: { id: string; slug?: string };
  datasets: Dataset[];
}) {
  return {
    schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    scope: input.scope,
    subject: input.subject,
    pagination: { strategy: "keyset", pageSize: PAGE_SIZE },
    datasets: input.datasets.map((dataset) => ({
      key: dataset.key,
      excludedFields: dataset.redact ?? [],
    })),
    excludedOperationalDatasets:
      input.scope === "tenant"
        ? [
            {
              key: "StripeWebhookEvent",
              reason: "privileged provider inbox with internal diagnostics",
            },
          ]
        : [],
  };
}

function jsonStream(input: {
  scope: "tenant" | "user";
  subject: { id: string; slug?: string };
  datasets: Dataset[];
  page: (dataset: Dataset, cursor: string) => Promise<ExportRow[]>;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const counts: Record<string, number> = {};
      try {
        controller.enqueue(
          encoder.encode(
            `{"manifest":${JSON.stringify(exportManifest(input))},"data":{`,
          ),
        );
        for (let datasetIndex = 0; datasetIndex < input.datasets.length; datasetIndex++) {
          const dataset = input.datasets[datasetIndex];
          if (datasetIndex) controller.enqueue(encoder.encode(","));
          controller.enqueue(encoder.encode(`${JSON.stringify(dataset.key)}:[`));
          let cursor = "";
          let count = 0;
          let first = true;
          while (true) {
            const rows = await input.page(dataset, cursor);
            for (const row of rows) {
              if (!first) controller.enqueue(encoder.encode(","));
              controller.enqueue(encoder.encode(JSON.stringify(row.data)));
              first = false;
              count += 1;
            }
            if (rows.length < PAGE_SIZE) break;
            cursor = rows.at(-1)!.cursor;
          }
          counts[dataset.key] = count;
          controller.enqueue(encoder.encode("]"));
        }
        controller.enqueue(
          encoder.encode(`},"summary":{"counts":${JSON.stringify(counts)}}}`),
        );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function csvStream(
  dataset: Dataset,
  page: (dataset: Dataset, cursor: string) => Promise<ExportRow[]>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("\uFEFF"));
        let cursor = "";
        let headers: string[] | null = null;
        while (true) {
          const rows = await page(dataset, cursor);
          for (const row of rows) {
            if (!headers) {
              headers = Object.keys(row.data);
              controller.enqueue(encoder.encode(`${headers.join(",")}\r\n`));
            }
            controller.enqueue(
              encoder.encode(`${headers.map((key) => csvEscape(row.data[key])).join(",")}\r\n`),
            );
          }
          if (rows.length < PAGE_SIZE) break;
          cursor = rows.at(-1)!.cursor;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export function tenantDataset(key: string): Dataset | null {
  return TENANT_DATASETS.find((dataset) => dataset.key === key) ?? null;
}

export function createTenantExport(input: {
  tenantId: string;
  slug: string;
  dataset?: string | null;
  format?: string | null;
}) {
  const selected = input.dataset ? tenantDataset(input.dataset) : null;
  if (input.dataset && !selected) return null;
  const datasets = selected ? [selected] : TENANT_DATASETS;
  const page = (dataset: Dataset, cursor: string) =>
    tenantPage(input.tenantId, dataset, cursor);
  return {
    stream:
      selected && input.format?.toLowerCase() === "csv"
        ? csvStream(selected, page)
        : jsonStream({
            scope: "tenant",
            subject: { id: input.tenantId, slug: input.slug },
            datasets,
            page,
          }),
    contentType:
      selected && input.format?.toLowerCase() === "csv"
        ? "text/csv; charset=utf-8"
        : "application/json; charset=utf-8",
    extension:
      selected && input.format?.toLowerCase() === "csv" ? "csv" : "json",
  };
}

export function createUserExport(input: { userId: string }) {
  const page = (dataset: Dataset, cursor: string) => userPage(input.userId, dataset, cursor);
  return {
    stream: jsonStream({
      scope: "user",
      subject: { id: input.userId },
      datasets: USER_DATASETS,
      page,
    }),
    contentType: "application/json; charset=utf-8",
  };
}

