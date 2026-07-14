-- Separate chat vs. image assistant conversations.
ALTER TABLE "AssistantConversation" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CHAT';

-- New composite index including the kind (matches the schema's @@index).
DROP INDEX IF EXISTS "AssistantConversation_tenantId_userId_updatedAt_idx";
CREATE INDEX "AssistantConversation_tenantId_userId_kind_updatedAt_idx"
  ON "AssistantConversation" ("tenantId", "userId", "kind", "updatedAt");
