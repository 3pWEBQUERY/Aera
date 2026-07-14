/**
 * Applies PostgreSQL Row Level Security as defense-in-depth on top of the
 * application-level tenant scoping. Policies isolate every tenant table by
 * `tenantId = current_setting('aera.tenant_id')`.
 *
 * NOTE: Postgres superusers and table owners bypass RLS. For enforcement in
 * production, run the app through the dedicated `aera_app` role (created here)
 * and set the tenant GUC per request/transaction. See README "Sicherheit".
 */
import "dotenv/config";
import { Client } from "pg";

const TENANT_TABLES = [
  "Membership", "MembershipTier", "Space", "Post", "Comment", "Reaction",
  "Course", "Lesson", "LessonProgress", "Event", "EventRsvp", "Product",
  "Order", "Subscription", "Entitlement", "NewsletterCampaign", "Segment",
  "EmailEvent", "GamificationRule", "PointsLedger", "Badge", "BadgeAward",
  "Level", "MemberStats", "StorageObject", "MediaFolder", "AiContextChunk", "Recommendation",
  "LiveSession", "LiveChatMessage", "KnowledgeArticle", "MediaPackage",
  "MediaItem", "AuditLog", "Conversation", "ConversationMember", "ChatMessage",
  "AssistantConversation", "AiCreditWallet", "AiUsageEvent", "AiCreditPurchase",
  "AiCreditReservation",
  "Notification", "ApiKey", "WebhookEndpoint", "WebhookDelivery",
  "ReferralConversion", "ModerationFlag", "AutomationStep",
  "AutomationDelivery",
  "NewsletterDelivery",
  "MemberRequest", "RequestVote", "BookingSlot", "BookingReservation", "Story", "Tip",
  "ContentPlan", "ContentPlanMedia",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();

  // Dedicated, least-privilege application role (no bypass of RLS).
  await client.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aera_app') THEN
      CREATE ROLE aera_app NOLOGIN;
    END IF;
  END $$;`);
  await client.query(`GRANT USAGE ON SCHEMA public TO aera_app;`);
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aera_app;`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aera_app;`,
  );
  await client.query(`REVOKE ALL ON FUNCTION aera_claim_webhook_deliveries(INTEGER) FROM PUBLIC;`);
  await client.query(`GRANT EXECUTE ON FUNCTION aera_claim_webhook_deliveries(INTEGER) TO aera_app;`);
  await client.query(`REVOKE ALL ON FUNCTION aera_active_automation_steps() FROM PUBLIC;`);
  await client.query(`GRANT EXECUTE ON FUNCTION aera_active_automation_steps() TO aera_app;`);
  await client.query(`REVOKE ALL ON FUNCTION aera_claim_automation_deliveries(INTEGER) FROM PUBLIC;`);
  await client.query(`GRANT EXECUTE ON FUNCTION aera_claim_automation_deliveries(INTEGER) TO aera_app;`);
  await client.query(`REVOKE ALL ON FUNCTION aera_claim_newsletter_deliveries(INTEGER) FROM PUBLIC;`);
  await client.query(`GRANT EXECUTE ON FUNCTION aera_claim_newsletter_deliveries(INTEGER) TO aera_app;`);
  await client.query(`REVOKE ALL ON FUNCTION aera_write_audit(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;`);
  await client.query(`GRANT EXECUTE ON FUNCTION aera_write_audit(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO aera_app;`);

  for (const t of TENANT_TABLES) {
    await client.query(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
    await client.query(`DROP POLICY IF EXISTS tenant_isolation ON "${t}";`);
    await client.query(
      `CREATE POLICY tenant_isolation ON "${t}"
         USING ("tenantId" = current_setting('aera.tenant_id', true))
         WITH CHECK ("tenantId" = current_setting('aera.tenant_id', true));`,
    );
  }

  // Tenant table: isolate by id.
  await client.query(`ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;`);
  await client.query(`DROP POLICY IF EXISTS tenant_self ON "Tenant";`);
  await client.query(
    `CREATE POLICY tenant_self ON "Tenant"
       USING (id = current_setting('aera.tenant_id', true));`,
  );

  console.log(
    `✅ RLS enabled on ${TENANT_TABLES.length + 1} tenant tables; role aera_app ready.`,
  );
  await client.end();
}

main().catch((e) => {
  console.error("RLS setup failed:", e);
  process.exit(1);
});
