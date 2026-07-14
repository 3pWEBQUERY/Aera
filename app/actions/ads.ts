"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { parseSpaceAds, AD_DURATION, type SpaceAd } from "@/lib/space-settings";
import { tErr } from "@/lib/action-errors";
import type { ActionState } from "./dashboard";
import type { Prisma } from "@/app/generated/prisma/client";

function urlOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(s)) return `https://${s}`;
  return null;
}

async function loadSpace(slug: string, spaceId: string) {
  const { tenant } = await requireTenantAdmin(slug);
  const space = await prisma.space.findFirst({
    where: { id: spaceId, tenantId: tenant.id, type: "ADS" },
  });
  return { tenant, space };
}

async function persist(
  tenantSlug: string,
  space: { id: string; slug: string; settings: unknown },
  ads: SpaceAd[],
) {
  const settings =
    space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
      ? (space.settings as Record<string, unknown>)
      : {};
  await prisma.space.update({
    where: { id: space.id },
    data: { settings: { ...settings, ads } as unknown as Prisma.InputJsonValue },
  });
  revalidatePath(`/dashboard/${tenantSlug}/spaces/${space.slug}`);
  // Ads render on the community home page.
  revalidatePath(`/c/${tenantSlug}`);
}

/** Create or update an ad banner of an ADS space. */
export async function saveSpaceAdAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const spaceId = String(fd.get("spaceId"));
  const { tenant, space } = await loadSpace(slug, spaceId);
  if (!space) return { error: await tErr("spaceNotFound") };

  const title = String(fd.get("title") ?? "").trim();
  if (!title) return { error: await tErr("titleRequired") };
  if (title.length > 120) return { error: await tErr("titleTooLong120") };

  const mediaUrl = String(fd.get("mediaUrl") ?? "").trim();
  if (!mediaUrl) return { error: await tErr("uploadImageOrVideo") };
  const mediaType = String(fd.get("mediaType")) === "VIDEO" ? "VIDEO" : "IMAGE";

  const targetRaw = String(fd.get("targetUrl") ?? "").trim();
  const targetUrl = targetRaw ? urlOrNull(fd.get("targetUrl")) : null;
  if (targetRaw && !targetUrl)
    return { error: await tErr("validTargetUrl") };

  const duration = Number(fd.get("durationSec"));
  const durationSec =
    Number.isFinite(duration) && duration >= AD_DURATION.min
      ? Math.min(AD_DURATION.max, Math.floor(duration))
      : AD_DURATION.default;

  const endsAtRaw = String(fd.get("endsAt") ?? "").trim();
  let endsAt: string | null = null;
  if (endsAtRaw) {
    const d = new Date(endsAtRaw);
    if (Number.isNaN(d.getTime())) return { error: await tErr("invalidEndDate") };
    endsAt = d.toISOString();
  }

  const ads = parseSpaceAds(space.settings);
  const existingId = String(fd.get("adId") ?? "");
  const existing = ads.find((a) => a.id === existingId);

  const entry: SpaceAd = {
    id: existing?.id ?? randomUUID(),
    title,
    mediaUrl: mediaUrl.slice(0, 600),
    mediaType,
    targetUrl,
    durationSec,
    endsAt,
    isPublished: fd.get("isPublished") === "on",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  const next = existing
    ? ads.map((a) => (a.id === existing.id ? entry : a))
    : [...ads, entry];

  await persist(slug, space, next);
  await writeAudit({
    tenantId: tenant.id,
    action: existing ? "space.ad.update" : "space.ad.create",
    targetType: "Space",
    targetId: space.id,
    metadata: { adId: entry.id },
  });
  return { ok: true };
}

/** Remove an ad banner from an ADS space. */
export async function deleteSpaceAdAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceId = String(fd.get("spaceId"));
  const adId = String(fd.get("adId"));
  const { tenant, space } = await loadSpace(slug, spaceId);
  if (!space) return;

  const ads = parseSpaceAds(space.settings).filter((a) => a.id !== adId);
  await persist(slug, space, ads);
  await writeAudit({
    tenantId: tenant.id,
    action: "space.ad.delete",
    targetType: "Space",
    targetId: space.id,
    metadata: { adId },
  });
}

/** Move an ad up or down in the rotation order. */
export async function moveSpaceAdAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceId = String(fd.get("spaceId"));
  const adId = String(fd.get("adId"));
  const dir = String(fd.get("dir")) === "up" ? -1 : 1;
  const { space } = await loadSpace(slug, spaceId);
  if (!space) return;

  const ads = parseSpaceAds(space.settings);
  const idx = ads.findIndex((a) => a.id === adId);
  const target = idx + dir;
  if (idx === -1 || target < 0 || target >= ads.length) return;
  [ads[idx], ads[target]] = [ads[target], ads[idx]];
  await persist(slug, space, ads);
}
