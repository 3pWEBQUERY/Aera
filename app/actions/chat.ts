"use server";

import { redirect } from "next/navigation";
import { tenantAllowsSpaceType, checkSpaceLimit } from "@/lib/plan";
import { revalidatePath } from "next/cache";
import prisma, { setTenantContext } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { uniqueChildSlug } from "@/lib/slug";
import { findOrCreateDirect } from "@/lib/chat";
import { activeRoleAtLeast } from "@/lib/tenant";

async function tenantBySlug(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (tenant) setTenantContext(tenant.id);
  return tenant;
}

function safeSlug(s: string): string {
  return /^[a-z0-9-]+$/i.test(s) ? s : "";
}

async function membership(tenantId: string, userId: string) {
  return prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
}

// ---------------------------------------------------------------- Start a DM
export async function startDirectAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const otherId = String(fd.get("userId") || "");
  const from = safeSlug(String(fd.get("from") || ""));
  const back = from ? `/c/${slug}/s/${from}` : `/c/${slug}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) redirect(back);

  const me = await membership(tenant!.id, user!.id);
  if (me?.status !== "ACTIVE") redirect(`/c/${slug}/join`);
  if (!otherId || otherId === user!.id) redirect(back);

  const other = await membership(tenant!.id, otherId);
  if (!other || other.status !== "ACTIVE") redirect(back);

  const convId = await findOrCreateDirect(tenant!.id, user!.id, otherId);
  redirect(`${back}?dm=${convId}`);
}

// ---------------------------------------------------------------- New group chat
export async function createChatGroupAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const name = String(fd.get("title") || "").trim().slice(0, 60);
  const access = String(fd.get("access") || "all"); // all | paid | level
  const levelKey = String(fd.get("levelKey") || "").trim();
  const from = safeSlug(String(fd.get("from") || ""));
  const back = from ? `/c/${slug}/s/${from}` : `/c/${slug}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  const tenant = await tenantBySlug(slug);
  if (!tenant) redirect(back);

  const me = await membership(tenant!.id, user!.id);
  if (!activeRoleAtLeast(me, "MODERATOR")) redirect(back);
  if (name.length < 2) redirect(back);

  // Package gate — a group chat creates a CHAT space, which is not free.
  if (!(await tenantAllowsSpaceType(tenant!.id, "CHAT"))) redirect(back);
  if (!(await checkSpaceLimit(tenant!.id)).allowed) redirect(back);

  const visibility = access === "all" ? "MEMBERS" : "PAID";
  const requiredEntitlementKey = access === "level" && levelKey ? levelKey : null;

  const space = await prisma.space.create({
    data: {
      tenantId: tenant!.id,
      name,
      slug: await uniqueChildSlug("space", tenant!.id, name),
      type: "CHAT",
      visibility,
      requiredEntitlementKey,
      sortOrder: await prisma.space.count({ where: { tenantId: tenant!.id } }),
    },
  });

  revalidatePath(`/c/${slug}`, "layout");
  revalidatePath(`/dashboard/${slug}/spaces`);
  redirect(`/c/${slug}/s/${space.slug}`);
}
