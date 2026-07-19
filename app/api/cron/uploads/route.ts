import { cleanupExpiredStorageReservations } from "@/lib/secure-upload";
import {
  authorizeCronRequest,
  cronMethodNotAllowed,
} from "@/lib/cron-auth";
import { runCronRoute } from "@/lib/cron-monitor";

export const dynamic = "force-dynamic";

/** Removes abandoned direct-upload objects and releases reserved quota. */
export async function POST(req: Request) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;
  return runCronRoute("uploads", async ({ deadlineAt }) => ({
    cleaned: await cleanupExpiredStorageReservations(200, { deadlineAt }),
  }));
}

export const GET = cronMethodNotAllowed;
