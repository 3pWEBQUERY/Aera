"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";

export interface ActionState {
  ok?: boolean;
  error?: string;
}
const ok: ActionState = { ok: true };

const DEFAULT_TTL_HOURS = 24;

function ttlFrom(fd: FormData): number {
  return Math.min(
    168,
    Math.max(1, Math.floor(Number(fd.get("ttlHours") || DEFAULT_TTL_HOURS) || DEFAULT_TTL_HOURS)),
  );
}

/** A future `publishAt` from the form, or null for "publish now". */
function scheduledPublishAt(fd: FormData): Date | null {
  const raw = String(fd.get("publishAt") || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now() ? d : null;
}

/** Staff publishes (or schedules) a story that expires after its TTL. */
export async function createStoryAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: "Space nicht gefunden." };

  const imageUrl = String(fd.get("imageUrl") || "") || null;
  const videoUrl = String(fd.get("videoUrl") || "") || null;
  if (!imageUrl && !videoUrl) return { error: "Bild oder Video erforderlich." };

  const hours = ttlFrom(fd);
  const publishAt = scheduledPublishAt(fd) ?? new Date();
  const expiresAt = new Date(publishAt.getTime() + hours * 3_600_000);

  await prisma.story.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      authorId: user.id,
      imageUrl,
      videoUrl,
      caption: String(fd.get("caption") || "").trim().slice(0, 280) || null,
      publishAt,
      expiresAt,
    },
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

/** Edit an existing story (media, caption, lifetime, schedule). */
export async function updateStoryAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const storyId = String(fd.get("storyId"));
  const story = await prisma.story.findFirst({ where: { id: storyId, tenantId: tenant.id } });
  if (!story) return { error: "Story nicht gefunden." };

  const imageUrl = String(fd.get("imageUrl") || "") || null;
  const videoUrl = String(fd.get("videoUrl") || "") || null;
  if (!imageUrl && !videoUrl) return { error: "Bild oder Video erforderlich." };

  const hours = ttlFrom(fd);
  const scheduled = scheduledPublishAt(fd);
  // A future schedule reschedules; otherwise keep the original go-live time for
  // already-published stories, or "now" if it had no valid past time.
  const publishAt =
    scheduled ?? (story.publishAt.getTime() <= Date.now() ? story.publishAt : new Date());
  const expiresAt = new Date(publishAt.getTime() + hours * 3_600_000);

  await prisma.story.update({
    where: { id: story.id },
    data: {
      imageUrl,
      videoUrl,
      caption: String(fd.get("caption") || "").trim().slice(0, 280) || null,
      publishAt,
      expiresAt,
    },
  });
  revalidatePath(`/dashboard/${slug}/spaces/${story.spaceId}`);
  revalidatePath(`/dashboard/${slug}/spaces`);
  const spaceSlug = String(fd.get("spaceSlug") || "");
  if (spaceSlug) {
    revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
    revalidatePath(`/c/${slug}/s/${spaceSlug}`);
  }
  return ok;
}

export async function deleteStoryAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const storyId = String(fd.get("storyId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const story = await prisma.story.findFirst({ where: { id: storyId, tenantId: tenant.id } });
  if (story) await prisma.story.delete({ where: { id: story.id } });
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}
