"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";

/** Fehlalarm: Flag freigeben, Inhalt bleibt online. */
export async function approveFlagAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const id = String(fd.get("id"));
  const { tenant, user } = await requireTenantAdmin(slug, "MODERATOR");

  await prisma.moderationFlag.updateMany({
    where: { id, tenantId: tenant.id, status: "PENDING" },
    data: { status: "APPROVED", resolvedById: user.id, resolvedAt: new Date() },
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "moderation.approve",
    metadata: { flagId: id },
  });
  revalidatePath(`/dashboard/${slug}/moderation`);
}

/** Verstoß bestätigt: gemeldeten Inhalt löschen, Flag abschließen. */
export async function removeFlaggedContentAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const id = String(fd.get("id"));
  const { tenant, user } = await requireTenantAdmin(slug, "MODERATOR");

  const flag = await prisma.moderationFlag.findFirst({
    where: { id, tenantId: tenant.id, status: "PENDING" },
  });
  if (!flag) return;

  if (flag.refType === "Post") {
    await prisma.post.deleteMany({
      where: { id: flag.refId, tenantId: tenant.id },
    });
  } else if (flag.refType === "Comment") {
    await prisma.comment.deleteMany({
      where: { id: flag.refId, tenantId: tenant.id },
    });
  }

  await prisma.moderationFlag.update({
    where: { id: flag.id },
    data: { status: "REMOVED", resolvedById: user.id, resolvedAt: new Date() },
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "moderation.remove",
    metadata: { flagId: id, refType: flag.refType, refId: flag.refId },
  });
  revalidatePath(`/dashboard/${slug}/moderation`);
}
