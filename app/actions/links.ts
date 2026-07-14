"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { parseSpaceLinks, type SpaceLink } from "@/lib/space-settings";
import { tErr } from "@/lib/action-errors";
import type { ActionState } from "./dashboard";
import type { Prisma } from "@/app/generated/prisma/client";

function normalizeUrl(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  // Convenience: allow "example.com" and prefix https.
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(s)) return `https://${s}`;
  return null;
}

async function loadSpace(slug: string, spaceId: string) {
  const { tenant } = await requireTenantAdmin(slug);
  const space = await prisma.space.findFirst({
    where: { id: spaceId, tenantId: tenant.id, type: "LINKS" },
  });
  return { tenant, space };
}

async function persist(
  tenantSlug: string,
  space: { id: string; slug: string; settings: unknown },
  links: SpaceLink[],
) {
  const settings =
    space.settings && typeof space.settings === "object" && !Array.isArray(space.settings)
      ? (space.settings as Record<string, unknown>)
      : {};
  await prisma.space.update({
    where: { id: space.id },
    data: { settings: { ...settings, links } as unknown as Prisma.InputJsonValue },
  });
  revalidatePath(`/dashboard/${tenantSlug}/spaces/${space.slug}`);
  revalidatePath(`/c/${tenantSlug}/s/${space.slug}`);
}

/** Create or update a curated link of a LINKS space. */
export async function saveSpaceLinkAction(
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

  const url = normalizeUrl(fd.get("url"));
  if (!url) return { error: await tErr("validUrlPathOrHttp") };

  const description = String(fd.get("description") ?? "").trim().slice(0, 240);

  const links = parseSpaceLinks(space.settings);
  const existingId = String(fd.get("linkId") ?? "");
  const existing = links.find((l) => l.id === existingId);

  const entry: SpaceLink = {
    id: existing?.id ?? randomUUID(),
    title,
    url,
    description,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  const next = existing
    ? links.map((l) => (l.id === existing.id ? entry : l))
    : [...links, entry];

  await persist(slug, space, next);
  await writeAudit({
    tenantId: tenant.id,
    action: existing ? "space.link.update" : "space.link.create",
    targetType: "Space",
    targetId: space.id,
    metadata: { linkId: entry.id },
  });
  return { ok: true };
}

/** Remove a curated link from a LINKS space. */
export async function deleteSpaceLinkAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceId = String(fd.get("spaceId"));
  const linkId = String(fd.get("linkId"));
  const { tenant, space } = await loadSpace(slug, spaceId);
  if (!space) return;

  const links = parseSpaceLinks(space.settings).filter((l) => l.id !== linkId);
  await persist(slug, space, links);
  await writeAudit({
    tenantId: tenant.id,
    action: "space.link.delete",
    targetType: "Space",
    targetId: space.id,
    metadata: { linkId },
  });
}

/** Move a link up or down in the curated order. */
export async function moveSpaceLinkAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const spaceId = String(fd.get("spaceId"));
  const linkId = String(fd.get("linkId"));
  const dir = String(fd.get("dir")) === "up" ? -1 : 1;
  const { space } = await loadSpace(slug, spaceId);
  if (!space) return;

  const links = parseSpaceLinks(space.settings);
  const idx = links.findIndex((l) => l.id === linkId);
  const target = idx + dir;
  if (idx === -1 || target < 0 || target >= links.length) return;
  [links[idx], links[target]] = [links[target], links[idx]];
  await persist(slug, space, links);
}
