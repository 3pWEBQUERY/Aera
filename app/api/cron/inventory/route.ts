import { releaseExpiredProductReservations } from "@/lib/product-inventory";
import {
  authorizeCronRequest,
  cronMethodNotAllowed,
} from "@/lib/cron-auth";
import { runCronRoute } from "@/lib/cron-monitor";

export const dynamic = "force-dynamic";

/** Releases abandoned stock reservations if a Stripe expiry event was lost. */
export async function POST(req: Request) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;

  return runCronRoute("inventory", ({ deadlineAt }) =>
    releaseExpiredProductReservations(200, new Date(), { deadlineAt }),
  );
}

export const GET = cronMethodNotAllowed;
