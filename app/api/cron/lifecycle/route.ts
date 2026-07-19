import { runDataLifecycleJobs } from "@/lib/data-lifecycle";
import {
  authorizeCronRequest,
  cronMethodNotAllowed,
} from "@/lib/cron-auth";
import { runCronRoute } from "@/lib/cron-monitor";

export const dynamic = "force-dynamic";

/** Retry external cleanup and only finalize deletion after every boundary is safe. */
export async function POST(req: Request) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;
  return runCronRoute("lifecycle", ({ deadlineAt }) =>
    runDataLifecycleJobs({ deadlineAt }),
  );
}

export const GET = cronMethodNotAllowed;

