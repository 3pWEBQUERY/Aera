-- Forum/feed polls. A post carries an optional poll (question + option labels
-- stored inline on the post); each member's choices live in PollVote. Purely
-- additive and backwards-compatible: existing posts simply have no poll.

ALTER TABLE "Post"
  ADD COLUMN "pollQuestion" TEXT,
  ADD COLUMN "pollOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "pollMultiple" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PollVote" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "optionIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- One row per (post, member, chosen option): a member may hold several rows
-- only when the poll allows multiple selections.
CREATE UNIQUE INDEX "PollVote_postId_userId_optionIndex_key"
  ON "PollVote"("postId", "userId", "optionIndex");
CREATE INDEX "PollVote_tenantId_idx" ON "PollVote"("tenantId");
CREATE INDEX "PollVote_postId_idx" ON "PollVote"("postId");

ALTER TABLE "PollVote"
  ADD CONSTRAINT "PollVote_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote"
  ADD CONSTRAINT "PollVote_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote"
  ADD CONSTRAINT "PollVote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- New tenant tables must be isolated immediately; relying only on a later
-- apply-rls run would leave a deployment window without database isolation.
ALTER TABLE "PollVote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PollVote"
  USING ("tenantId" = current_setting('aera.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('aera.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aera_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PollVote" TO aera_app;
  END IF;
END $$;
