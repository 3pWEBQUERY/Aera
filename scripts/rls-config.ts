/**
 * RLS inventory shared by the verifier and its tests.
 *
 * The migration in prisma/migrations/20260719110000_rls_least_privilege is
 * the source of truth for database changes. Keep this inventory in sync with
 * every Prisma model that owns a tenantId column.
 */
export const TENANT_RLS_TABLES = [
  "Membership",
  "MembershipTier",
  "Space",
  "MemberRequest",
  "RequestVote",
  "ContentPlan",
  "ContentPlanMedia",
  "BookingSlot",
  "BookingReservation",
  "Story",
  "Tip",
  "MediaPackage",
  "MediaItem",
  "Post",
  "Comment",
  "Reaction",
  "Course",
  "Lesson",
  "LessonProgress",
  "Event",
  "EventRsvp",
  "Product",
  "Order",
  "Subscription",
  "Entitlement",
  "NewsletterCampaign",
  "Segment",
  "EmailEvent",
  "NewsletterDelivery",
  "NewsletterConsent",
  "NewsletterConsentEvent",
  "EmailSuppression",
  "GamificationRule",
  "PointsLedger",
  "Badge",
  "BadgeAward",
  "Level",
  "MemberStats",
  "MediaFolder",
  "StorageObject",
  "StorageUploadReservation",
  "AiContextChunk",
  "Recommendation",
  "LiveSession",
  "LiveChatMessage",
  "KnowledgeArticle",
  "AuditLog",
  "Conversation",
  "ConversationMember",
  "ChatMessage",
  "AssistantConversation",
  "AiCreditWallet",
  "PendingCreatorCheckout",
  "AiUsageEvent",
  "AiCreditPurchase",
  "AiCreditReservation",
  "StripeWebhookEvent",
  "Notification",
  "ApiKey",
  "WebhookEndpoint",
  "WebhookDelivery",
  "ModerationFlag",
  "AutomationStep",
  "AutomationDelivery",
  "ReferralConversion",
  "ObjectDeletionTask",
  "StorageReconciliationState",
] as const;

/** Tenant tables used by normal request flows. */
export const TENANT_CRUD_TABLES = TENANT_RLS_TABLES.filter(
  (table) =>
    table !== "AuditLog" &&
    table !== "StripeWebhookEvent" &&
    table !== "ObjectDeletionTask" &&
    table !== "StorageReconciliationState",
);

/** Audit history is append-only; writes use the explicit privileged client. */
export const TENANT_READ_ONLY_TABLES = ["AuditLog"] as const;

/** Stripe's durable inbox is only used by the privileged platform path. */
export const PRIVILEGED_ONLY_TENANT_TABLES = [
  "StripeWebhookEvent",
  "ObjectDeletionTask",
  "StorageReconciliationState",
] as const;

/** Non-tenant tables required by tenant-scoped Prisma relations/actions. */
export const SUPPORTING_TABLE_PRIVILEGES = {
  User: [],
  AssistantMessage: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  PushSubscription: ["SELECT", "INSERT", "UPDATE", "DELETE"],
} as const;

/** Tenant lifecycle deletion stays on the explicit privileged path. */
export const TENANT_TABLE_PRIVILEGES = ["SELECT"] as const;

/** Explicit column grants for global rows touched inside tenant transactions. */
export const COLUMN_PRIVILEGES = {
  Tenant: {
    UPDATE: [
      "name",
      "subdomain",
      "customDomain",
      "tagline",
      "description",
      "logoUrl",
      "primaryColor",
      "accentColor",
      "category",
      "layout",
      "updatedAt",
    ],
  },
  User: {
    SELECT: [
      "id",
      "email",
      "name",
      "avatarUrl",
      "emailVerifiedAt",
      "createdAt",
      "updatedAt",
    ],
    UPDATE: [],
  },
} as const;

export const TENANT_FUNCTIONS = [
  "public.aera_reserve_ai_credit(text,text,text,text,text)",
  "public.aera_settle_ai_credit(text,text,text,integer,integer,integer,integer)",
  "public.aera_release_ai_credit(text,text)",
  "public.aera_refund_ai_credit_purchase(text,text)",
] as const;

/** Cross-tenant workers stay on the privileged connection. */
export const PRIVILEGED_FUNCTIONS = [
  "public.aera_write_audit(text,text,text,text,text,text,jsonb)",
  "public.aera_claim_webhook_deliveries(integer)",
  "public.aera_active_automation_steps()",
  "public.aera_claim_automation_deliveries(integer)",
  "public.aera_claim_newsletter_deliveries(integer)",
] as const;
