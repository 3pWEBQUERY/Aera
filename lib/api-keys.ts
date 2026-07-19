import "server-only";
import { createHash, randomBytes } from "crypto";
import prisma from "./prisma";
import type { Tenant } from "@/app/generated/prisma/client";

/**
 * Öffentliche API: Schlüsselverwaltung.
 *
 * Keys haben die Form `aera_sk_<48 hex>`. Gespeichert wird ausschließlich der
 * SHA-256-Hash — der Klartext-Key wird dem Creator genau einmal angezeigt.
 */

const KEY_PREFIX = "aera_sk_";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface CreatedApiKey {
  id: string;
  /** Klartext — nur direkt nach dem Erstellen verfügbar. */
  key: string;
  prefix: string;
}

export async function createApiKey(
  tenantId: string,
  name: string,
): Promise<CreatedApiKey> {
  const key = KEY_PREFIX + randomBytes(24).toString("hex");
  const prefix = key.slice(0, KEY_PREFIX.length + 6) + "…";
  const row = await prisma.apiKey.create({
    data: { tenantId, name, prefix, keyHash: hashApiKey(key) },
  });
  return { id: row.id, key, prefix };
}

export async function revokeApiKey(tenantId: string, id: string): Promise<void> {
  await prisma.apiKey.updateMany({
    where: { id, tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Authentifiziert einen API-Request über `Authorization: Bearer aera_sk_…`.
 * Gibt den Tenant zurück oder null. Aktualisiert `lastUsedAt` (best effort).
 */
export async function authenticateApiRequest(
  req: Request,
): Promise<{ tenant: Tenant; keyId: string } | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(aera_sk_[a-f0-9]{48})$/i.exec(header.trim());
  if (!match) return null;

  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(match[1]) },
    include: { tenant: true },
  });
  if (!row || row.revokedAt || row.tenant.status !== "ACTIVE") return null;

  // Best effort — ein fehlgeschlagenes Update darf den Request nicht stoppen.
  prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return { tenant: row.tenant, keyId: row.id };
}
