import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runAutomations } from "@/lib/automations";
import { processPendingWebhookDeliveries } from "@/lib/webhooks";
import { processPendingNewsletterDeliveries } from "@/lib/newsletter-delivery";

/**
 * GET /api/cron/automations?secret=<CRON_SECRET>
 * (alternativ Header `Authorization: Bearer <CRON_SECRET>`)
 *
 * Von einem externen Scheduler (z. B. Railway Cron) stündlich aufrufen.
 * Verarbeitet fällige Onboarding-E-Mails; idempotent.
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

  const [result, webhookDeliveries, newsletterDeliveries] = await Promise.all([
    runAutomations(),
    processPendingWebhookDeliveries(100),
    processPendingNewsletterDeliveries(200),
  ]);
  return NextResponse.json({ ok: true, ...result, webhookDeliveries, newsletterDeliveries });
}
