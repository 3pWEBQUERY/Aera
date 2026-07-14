import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { publishDueScheduledPosts } from "@/lib/scheduled-posts";

/**
 * GET /api/cron/posts?secret=<CRON_SECRET>
 * Run every minute. Flips scheduled posts to published once their time arrives.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "cron-disabled" }, { status: 503 });
  }
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await publishDueScheduledPosts(200);
  for (const ref of result.refs) {
    revalidatePath(`/c/${ref.tenantSlug}/s/${ref.spaceSlug}`);
    revalidatePath(`/c/${ref.tenantSlug}`);
  }
  return NextResponse.json({ ok: true, published: result.published });
}
