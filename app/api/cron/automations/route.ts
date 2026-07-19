import { runAutomations } from "@/lib/automations";
import {
  authorizeCronRequest,
  cronMethodNotAllowed,
} from "@/lib/cron-auth";
import { runCronRoute } from "@/lib/cron-monitor";

/**
 * POST /api/cron/automations
 * Authorization: Bearer <CRON_SECRET>
 *
 * Von einem externen Scheduler (z. B. Railway Cron) alle fünf Minuten aufrufen.
 * Verarbeitet fällige Onboarding-E-Mails; idempotent.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;

  // Newsletter and webhook delivery have dedicated routes. Keeping them out
  // of this job prevents duplicate orchestration and makes each heartbeat
  // accurately describe one responsibility.
  return runCronRoute("automations", ({ deadlineAt }) =>
    runAutomations({ deadlineAt }),
  );
}

export const GET = cronMethodNotAllowed;
