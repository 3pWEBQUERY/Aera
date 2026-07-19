"use server";

import { revalidatePath } from "next/cache";
import prisma, { systemPrisma } from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";

function revalidateCommunity(slug: string) {
  revalidatePath(`/c/${slug}`, "layout");
  revalidatePath(`/dashboard/${slug}/settings`);
}

/**
 * Called right after a successful cover upload: keeps only the newest
 * "community-cover" object (older ones are replaced) and refreshes the pages.
 */
export async function setCommunityCoverAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);

  const covers = await prisma.storageObject.findMany({
    where: { tenantId: tenant.id, purpose: "community-cover" },
    orderBy: { createdAt: "desc" },
    select: { id: true, key: true },
  });
  if (covers.length > 1) {
    const stale = covers.slice(1);
    await systemPrisma.$transaction(async (tx) => {
      await tx.objectDeletionTask.createMany({
        data: stale.map((cover) => ({
          tenantId: tenant.id,
          key: cover.key,
          reason: "replaced_community_cover",
        })),
        skipDuplicates: true,
      });
      await tx.storageObject.deleteMany({
        where: { tenantId: tenant.id, id: { in: stale.map((cover) => cover.id) } },
      });
    });
  }
  await writeAudit({ tenantId: tenant.id, action: "branding.cover.set" });
  revalidateCommunity(slug);
}

/** Removes the community cover — the hero falls back to the brand gradient. */
export async function removeCommunityCoverAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const covers = await prisma.storageObject.findMany({
    where: { tenantId: tenant.id, purpose: "community-cover" },
    select: { id: true, key: true },
  });
  if (covers.length) {
    await systemPrisma.$transaction(async (tx) => {
      await tx.objectDeletionTask.createMany({
        data: covers.map((cover) => ({
          tenantId: tenant.id,
          key: cover.key,
          reason: "removed_community_cover",
        })),
        skipDuplicates: true,
      });
      await tx.storageObject.deleteMany({
        where: { tenantId: tenant.id, id: { in: covers.map((cover) => cover.id) } },
      });
    });
  }
  await writeAudit({ tenantId: tenant.id, action: "branding.cover.remove" });
  revalidateCommunity(slug);
}
