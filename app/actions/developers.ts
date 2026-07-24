"use server";

import { revalidatePath } from "next/cache";
import { featureBlocked } from "@/lib/plan";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { createApiKey, revokeApiKey } from "@/lib/api-keys";
import {
  generateWebhookSecret,
  WEBHOOK_EVENTS,
  type WebhookEventType,
} from "@/lib/webhooks";
import { validateWebhookUrl } from "@/lib/webhook-url";
import { writeAudit } from "@/lib/audit";
import { tErr } from "@/lib/action-errors";
import { encryptSecret } from "@/lib/secret-encryption";

export interface DeveloperState {
  error?: string;
  ok?: boolean;
  /** Klartext-Key — nur einmal direkt nach dem Erstellen vorhanden. */
  createdKey?: string;
  /** Webhook-Signing-Secret — ebenfalls nur direkt nach Erstellung sichtbar. */
  createdWebhookSecret?: string;
}

const MAX_KEYS = 10;
const MAX_ENDPOINTS = 10;

// ------------------------------------------------------------- API-Keys
export async function createApiKeyAction(
  _p: DeveloperState,
  fd: FormData,
): Promise<DeveloperState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");
  // Package gate — a downgraded client keeps working Server Action ids.
  const planBlocked = await featureBlocked(tenant.id, "developers");
  if (planBlocked) return { error: planBlocked };

  const name = String(fd.get("name") || "").trim().slice(0, 60);
  if (name.length < 2) return { error: await tErr("keyName") };

  const active = await prisma.apiKey.count({
    where: { tenantId: tenant.id, revokedAt: null },
  });
  if (active >= MAX_KEYS) {
    return { error: await tErr("maxKeys", { max: MAX_KEYS }) };
  }

  const created = await createApiKey(tenant.id, name);
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "apikey.create",
    metadata: { name },
  });
  revalidatePath(`/dashboard/${slug}/developers`);
  return { ok: true, createdKey: created.key };
}

export async function revokeApiKeyAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const id = String(fd.get("id"));
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");
  await revokeApiKey(tenant.id, id);
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "apikey.revoke",
    metadata: { id },
  });
  revalidatePath(`/dashboard/${slug}/developers`);
}

// ------------------------------------------------------------- Webhooks
export async function createWebhookEndpointAction(
  _p: DeveloperState,
  fd: FormData,
): Promise<DeveloperState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");
  // Package gate — a downgraded client keeps working Server Action ids.
  const planBlocked = await featureBlocked(tenant.id, "developers");
  if (planBlocked) return { error: planBlocked };

  const url = String(fd.get("url") || "").trim();
  const checked = await validateWebhookUrl(url, {
    allowHttp: process.env.NODE_ENV !== "production",
  });
  if (!checked.ok) {
    if (checked.error === "HTTPS is required") return { error: await tErr("webhookHttps") };
    return { error: await tErr("validUrl") };
  }
  if (!checked.url.startsWith("https:") && process.env.NODE_ENV === "production") {
    return { error: await tErr("webhookHttps") };
  }

  const events = WEBHOOK_EVENTS.filter((e) => fd.get(`event:${e}`) === "on");
  if (events.length === 0) {
    return { error: await tErr("chooseEvent") };
  }

  const count = await prisma.webhookEndpoint.count({
    where: { tenantId: tenant.id },
  });
  if (count >= MAX_ENDPOINTS) {
    return { error: await tErr("maxEndpoints", { max: MAX_ENDPOINTS }) };
  }

  const secret = generateWebhookSecret();
  await prisma.webhookEndpoint.create({
    data: {
      tenantId: tenant.id,
      url: checked.url,
      secret: encryptSecret(secret),
      events: events as WebhookEventType[],
    },
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "webhook.create",
    metadata: { url: checked.url },
  });
  revalidatePath(`/dashboard/${slug}/developers`);
  return { ok: true, createdWebhookSecret: secret };
}

export async function toggleWebhookEndpointAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const id = String(fd.get("id"));
  const { tenant } = await requireTenantAdmin(slug, "OWNER");
  const ep = await prisma.webhookEndpoint.findFirst({
    where: { id, tenantId: tenant.id },
  });
  if (ep) {
    await prisma.webhookEndpoint.update({
      where: { id: ep.id },
      data: { isActive: !ep.isActive },
    });
  }
  revalidatePath(`/dashboard/${slug}/developers`);
}

export async function deleteWebhookEndpointAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const id = String(fd.get("id"));
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");
  await prisma.webhookEndpoint.deleteMany({
    where: { id, tenantId: tenant.id },
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "webhook.delete",
    metadata: { id },
  });
  revalidatePath(`/dashboard/${slug}/developers`);
}
