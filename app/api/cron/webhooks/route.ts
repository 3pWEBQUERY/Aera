import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processPendingWebhookDeliveries } from "@/lib/webhooks";

/**
 * GET /api/cron/webhooks?secret=<CRON_SECRET>
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

  const result = await processPendingWebhookDeliveries(100);
  return NextResponse.json({ ok: true, ...result });
}
