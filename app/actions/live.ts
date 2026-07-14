"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { newRoomName } from "@/lib/live";
import type { LiveStatus } from "@/app/generated/prisma/client";

export interface ActionState {
  ok?: boolean;
  error?: string;
}

const ok: ActionState = { ok: true };

function parseDate(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Create a scheduled/live session inside a LIVE space. Staff only. */
export async function createLiveSessionAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug);
  const spaceId = String(fd.get("spaceId"));
  const space = await prisma.space.findFirst({ where: { id: spaceId, tenantId: tenant.id } });
  if (!space) return { error: "Space nicht gefunden." };

  const title = String(fd.get("title") || "").trim();
  if (title.length < 2) return { error: "Titel fehlt." };

  const session = await prisma.liveSession.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      title,
      status: "SCHEDULED",
      roomName: newRoomName(),
      hostId: user.id,
      streamUrl: String(fd.get("streamUrl") || "") || null,
      requiredEntitlementKey: String(fd.get("requiredEntitlementKey") || "") || null,
      startsAt: parseDate(fd.get("startsAt")),
    },
  });
  await writeAudit({
    tenantId: tenant.id,
    action: "live.create",
    targetType: "LiveSession",
    targetId: session.id,
  });
  revalidatePath(`/dashboard/${slug}/spaces/${space.slug}`);
  revalidatePath(`/c/${slug}/s/${space.slug}`);
  return ok;
}

/** Change a session's status (go live / end) and optionally set the replay URL. */
export async function updateLiveSessionAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const sessionId = String(fd.get("sessionId"));
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, tenantId: tenant.id },
    include: { space: { select: { slug: true } } },
  });
  if (!session) return { error: "Session nicht gefunden." };

  const rawStatus = String(fd.get("status") || "");
  const status: LiveStatus | undefined =
    rawStatus === "SCHEDULED" || rawStatus === "LIVE" || rawStatus === "ENDED"
      ? rawStatus
      : undefined;
  const title = String(fd.get("title") || "").trim();

  await prisma.liveSession.update({
    where: { id: session.id },
    data: {
      ...(title.length >= 2 ? { title } : {}),
      ...(status ? { status } : {}),
      ...(status === "ENDED" ? { endedAt: new Date() } : {}),
      ...(fd.get("streamUrl") !== null ? { streamUrl: String(fd.get("streamUrl")) || null } : {}),
      ...(fd.get("replayUrl") !== null ? { replayUrl: String(fd.get("replayUrl")) || null } : {}),
      ...(fd.get("startsAt") !== null ? { startsAt: parseDate(fd.get("startsAt")) } : {}),
    },
  });
  if (session.space) {
    revalidatePath(`/dashboard/${slug}/spaces/${session.space.slug}`);
    revalidatePath(`/c/${slug}/s/${session.space.slug}`);
  }
  return ok;
}

export async function deleteLiveSessionAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const sessionId = String(fd.get("sessionId"));
  const spaceSlug = String(fd.get("spaceSlug") || "");
  const session = await prisma.liveSession.findFirst({ where: { id: sessionId, tenantId: tenant.id } });
  if (session) await prisma.liveSession.delete({ where: { id: session.id } });
  revalidatePath(`/dashboard/${slug}/spaces/${spaceSlug}`);
  revalidatePath(`/c/${slug}/s/${spaceSlug}`);
}
