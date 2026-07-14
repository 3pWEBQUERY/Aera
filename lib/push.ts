import "server-only";
import prisma from "./prisma";
import { env, features } from "./env";

/**
 * Web-Push-Versand (VAPID). Key-gated: ohne VAPID-Keys ist alles ein No-op.
 * Abgelaufene/ungültige Subscriptions (404/410) werden automatisch entfernt.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Ziel beim Klick (same-origin Pfad). */
  url: string;
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!features.push) return;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;

    const { default: webpush } = await import("web-push");
    webpush.setVapidDetails(
      `mailto:noreply@${env.ROOT_DOMAIN}`,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            { TTL: 3600 },
          );
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Subscription ist tot -> aufräumen.
            await prisma.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => undefined);
          }
        }
      }),
    );
  } catch (e) {
    console.error("sendPushToUser failed:", e);
  }
}
