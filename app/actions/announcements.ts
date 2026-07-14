"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import {
  parseAnnouncements,
  ANNOUNCEMENT_DEFAULTS,
  type SpaceAnnouncement,
} from "@/lib/space-settings";
import { tErr } from "@/lib/action-errors";
import type { ActionState } from "./dashboard";
import type { Prisma } from "@/app/generated/prisma/client";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function color(v: FormDataEntryValue | null, fallback: string): string {
  const s = String(v ?? "").trim();
  return HEX_COLOR.test(s) ? s : fallback;
}

function urlOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

async function loadSpace(slug: string, spaceId: string) {
  const { tenant } = await requireTenantAdmin(slug);
  const space = await prisma.space.findFirst({
    where: { id: spaceId, tenantId: tenant.id },
  });
  return { tenant, space };
}

async function persist(
  tenantSlug: string,
  space: { id: string; slug: string; settings: unknown },
  announcements: SpaceAnnouncement[],
) {
  const settings =
    space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
      ? (space.settings as Record<string, unknown>)
      : {};
  await prisma.space.update({
    where: { id: space.id },
    data: {
      settings: { ...settings, announcements } as unknown as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/dashboard/${tenantSlug}/spaces/${space.slug}`);
  // Banner renders in the community layout on every page.
  revalidatePath(`/c/${tenantSlug}`, "layout");
}

export async function saveAnnouncementAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const spaceId = String(fd.get("spaceId"));
  const { tenant, space } = await loadSpace(slug, spaceId);
  if (!space) return { error: await tErr("spaceNotFound") };

  const title = String(fd.get("title") ?? "").trim();
  if (!title) return { error: await tErr("titleRequired") };
  if (title.length > 160) return { error: await tErr("titleTooLong160") };

  const message = String(fd.get("message") ?? "").trim().slice(0, 240);
  const ctaLabel = String(fd.get("ctaLabel") ?? "").trim().slice(0, 40) || null;
  const ctaUrl = urlOrNull(fd.get("ctaUrl"));
  if (ctaLabel && !ctaUrl)
    return { error: await tErr("validButtonUrl") };

  const endsAtRaw = String(fd.get("endsAt") ?? "").trim();
  let endsAt: string | null = null;
  if (endsAtRaw) {
    const d = new Date(endsAtRaw);
    if (Number.isNaN(d.getTime())) return { error: await tErr("invalidExpiryDate") };
    endsAt = d.toISOString();
  }
  const showTimer = fd.get("showTimer") === "on";
  if (showTimer && !endsAt)
    return { error: await tErr("countdownNeedsExpiry") };

  const announcements = parseAnnouncements(space.settings);
  const existingId = String(fd.get("announcementId") ?? "");
  const existing = announcements.find((a) => a.id === existingId);

  const entry: SpaceAnnouncement = {
    id: existing?.id ?? randomUUID(),
    title,
    message,
    bgColor: color(fd.get("bgColor"), ANNOUNCEMENT_DEFAULTS.bgColor),
    textColor: color(fd.get("textColor"), ANNOUNCEMENT_DEFAULTS.textColor),
    bgImageUrl: urlOrNull(fd.get("bgImageUrl")),
    ctaLabel,
    ctaUrl,
    endsAt,
    showTimer,
    isPublished: fd.get("isPublished") === "on",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  const next = existing
    ? announcements.map((a) => (a.id === existing.id ? entry : a))
    : [entry, ...announcements];

  await persist(slug, space, next);
  await writeAudit({
    tenantId: tenant.id,
    action: existing ? "announcement.update" : "announcement.create",
    targetType: "Space",
    targetId: space.id,
    metadata: { announcementId: entry.id },
  });
  return { ok: true };
}

/** Toggle "announcements only" mode for a space (hides it from the community). */
export async function toggleAnnouncementsOnlyAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceId = String(fd.get("spaceId"));
  const enabled = fd.get("enabled") === "on";
  const { tenant, space } = await loadSpace(slug, spaceId);
  if (!space) return;

  const settings =
    space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
      ? (space.settings as Record<string, unknown>)
      : {};
  await prisma.space.update({
    where: { id: space.id },
    data: {
      settings: { ...settings, announcementsOnly: enabled } as unknown as Prisma.InputJsonValue,
    },
  });
  await writeAudit({
    tenantId: tenant.id,
    action: enabled ? "space.announcementsOnly.enable" : "space.announcementsOnly.disable",
    targetType: "Space",
    targetId: space.id,
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/dashboard/${slug}`, "layout");
  revalidatePath(`/c/${slug}`, "layout");
}

export async function deleteAnnouncementAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceId = String(fd.get("spaceId"));
  const announcementId = String(fd.get("announcementId"));
  const { tenant, space } = await loadSpace(slug, spaceId);
  if (!space) return;

  const announcements = parseAnnouncements(space.settings);
  const next = announcements.filter((a) => a.id !== announcementId);
  if (next.length === announcements.length) return;

  await persist(slug, space, next);
  await writeAudit({
    tenantId: tenant.id,
    action: "announcement.delete",
    targetType: "Space",
    targetId: space.id,
    metadata: { announcementId },
  });
}
