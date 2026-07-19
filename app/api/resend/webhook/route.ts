import { env } from "@/lib/env";
import {
  parseAndVerifyResendWebhook,
  processResendWebhook,
} from "@/lib/resend-webhook";

export async function POST(request: Request) {
  if (!env.RESEND_WEBHOOK_SECRET) {
    return new Response("Webhook is not configured", { status: 503 });
  }
  const body = await request.text();
  const verified = parseAndVerifyResendWebhook({
    body,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  });
  if (!verified) return new Response("Invalid webhook", { status: 400 });
  await processResendWebhook(verified.id, verified.event);
  return new Response(null, { status: 200 });
}
