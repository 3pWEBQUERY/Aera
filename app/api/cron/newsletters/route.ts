import {
  dispatchNewsletterCampaigns,
  processPendingNewsletterDeliveries,
} from "@/lib/newsletter-delivery";
import {
  authorizeCronRequest,
  cronMethodNotAllowed,
} from "@/lib/cron-auth";
import { runCronRoute } from "@/lib/cron-monitor";

/**
 * POST /api/cron/newsletters with Authorization: Bearer <CRON_SECRET>.
 * Run every five minutes. Database leases make parallel scheduler calls safe.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;

  return runCronRoute("newsletters", async ({ deadlineAt }) => {
    const campaigns = await dispatchNewsletterCampaigns({ deadlineAt });
    const deliveries = await processPendingNewsletterDeliveries(200, {
      deadlineAt,
    });
    return {
      campaignsClaimed: campaigns.claimed,
      campaignsCompleted: campaigns.completed,
      campaignQueueErrors: campaigns.failed,
      recipientsQueued: campaigns.queued,
      ...deliveries,
    };
  });
}

export const GET = cronMethodNotAllowed;
