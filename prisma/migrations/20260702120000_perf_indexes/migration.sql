-- Performance indexes flagged in the code review (hot query paths).
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE INDEX "Post_tenantId_authorId_idx" ON "Post"("tenantId", "authorId");
CREATE INDEX "Comment_tenantId_authorId_idx" ON "Comment"("tenantId", "authorId");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
CREATE INDEX "Reaction_postId_type_idx" ON "Reaction"("postId", "type");
CREATE INDEX "Reaction_commentId_type_idx" ON "Reaction"("commentId", "type");
CREATE INDEX "PointsLedger_tenantId_userId_ruleId_createdAt_idx" ON "PointsLedger"("tenantId", "userId", "ruleId", "createdAt");
CREATE INDEX "Entitlement_tenantId_key_idx" ON "Entitlement"("tenantId", "key");
