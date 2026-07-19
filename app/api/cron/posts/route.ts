import { revalidatePath } from "next/cache";
import { publishDueScheduledPosts } from "@/lib/scheduled-posts";
import {
  authorizeCronRequest,
  cronMethodNotAllowed,
} from "@/lib/cron-auth";
import { runCronRoute } from "@/lib/cron-monitor";

/**
 * POST /api/cron/posts with Authorization: Bearer <CRON_SECRET>.
 * Run every five minutes. Flips scheduled posts to published once their time arrives.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = authorizeCronRequest(req);
  if (denied) return denied;

  return runCronRoute("posts", async () => {
    const result = await publishDueScheduledPosts(200);
    for (const ref of result.refs) {
      revalidatePath(`/c/${ref.tenantSlug}/s/${ref.spaceSlug}`);
      revalidatePath(`/c/${ref.tenantSlug}`);
    }
    return { published: result.published };
  });
}

export const GET = cronMethodNotAllowed;
