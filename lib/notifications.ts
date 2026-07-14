import "server-only";
import prisma from "./prisma";
import type { NotificationType } from "@/app/generated/prisma/client";

/**
 * In-App-Benachrichtigungen (pro Tenant).
 *
 * Erzeugung ist bewusst "best effort": ein fehlgeschlagenes Insert darf nie
 * die auslösende Aktion (Kommentar, Reaktion, …) zum Scheitern bringen —
 * deshalb kapselt `notify()` alles in ein catch.
 */

export interface NotifyInput {
  tenantId: string;
  /** Empfänger. */
  userId: string;
  /** Auslöser (Kommentator, Reagierender, …). */
  actorId: string;
  type: NotificationType;
  message: string;
  href: string;
  refType?: string;
  refId?: string;
}

export async function notify(input: NotifyInput): Promise<void> {
  // Niemals über die eigene Aktion benachrichtigen.
  if (input.userId === input.actorId) return;
  try {
    // Dedupe: identische Benachrichtigung (gleicher Auslöser, gleiches Ziel,
    // gleicher Typ) nicht stapeln — verhindert z. B. Like/Unlike-Spam.
    if (input.refId) {
      const existing = await prisma.notification.findFirst({
        where: {
          tenantId: input.tenantId,
          userId: input.userId,
          actorId: input.actorId,
          type: input.type,
          refId: input.refId,
        },
        select: { id: true },
      });
      if (existing) return;
    }
    await prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        actorId: input.actorId,
        type: input.type,
        message: input.message,
        href: input.href,
        refType: input.refType,
        refId: input.refId,
      },
    });
    // Zusätzlich Web-Push aufs Gerät (key-gated, best effort).
    const { sendPushToUser } = await import("./push");
    await sendPushToUser(input.userId, {
      title: "Aera",
      body: input.message,
      url: input.href,
    });
  } catch (e) {
    console.error("notify() failed:", e);
  }
}

export async function unreadNotificationCount(
  tenantId: string,
  userId: string,
): Promise<number> {
  return prisma.notification.count({
    where: { tenantId, userId, readAt: null },
  });
}

export interface NotificationRow {
  id: string;
  type: NotificationType;
  message: string;
  href: string;
  readAt: Date | null;
  createdAt: Date;
  actor: { name: string; avatarUrl: string | null } | null;
}

export async function listNotifications(
  tenantId: string,
  userId: string,
  limit = 30,
): Promise<NotificationRow[]> {
  const rows = await prisma.notification.findMany({
    where: { tenantId, userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { name: true, avatarUrl: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    href: r.href,
    readAt: r.readAt,
    createdAt: r.createdAt,
    actor: r.actor,
  }));
}

/** Idempotent: markiert alle ungelesenen Benachrichtigungen als gelesen. */
export async function markAllNotificationsRead(
  tenantId: string,
  userId: string,
): Promise<void> {
  await prisma.notification.updateMany({
    where: { tenantId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}
