import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processPendingNewsletterDeliveries } from "@/lib/newsletter-delivery";

/**
 * GET /api/cron/newsletters?secret=<CRON_SECRET>
 * Run every minute. Database leases make parallel scheduler calls safe.
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

  const result = await processPendingNewsletterDeliveries(200);
  return NextResponse.json({ ok: true, ...result });
}
