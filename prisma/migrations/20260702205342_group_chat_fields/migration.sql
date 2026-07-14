-- DropIndex
DROP INDEX "Conversation_tenantId_lastMessageAt_idx";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "accessKey" TEXT,
ADD COLUMN     "avatarColor" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_tenantId_kind_lastMessageAt_idx" ON "Conversation"("tenantId", "kind", "lastMessageAt");
