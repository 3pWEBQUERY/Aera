import { processPendingWebhookDeliveries } from "@/lib/webhooks";
import {
  authorizeCronRequest,
  cronMethodNotAllowed,
} from "@/lib/cron-auth";
import { runCronRoute } from "@/lib/cron-monitor";

/**
 * POST /api/cron/webhooks with Authorization: Bearer <CRON_SECRET>.
 * Run every five minutes. Database leases make parallel scheduler calls safe.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;

  return runCronRoute("webhooks", ({ deadlineAt }) =>
    processPendingWebhookDeliveries(100, { deadlineAt }),
  );
}

export const GET = cronMethodNotAllowed;
