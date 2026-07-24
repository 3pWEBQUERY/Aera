"use server";

import { revalidatePath } from "next/cache";
import { featureBlocked, tenantHasFeature } from "@/lib/plan";
import prisma, { withTenantTransaction } from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import type { ContentPlanStatus, ContentPlanType, Prisma } from "@/app/generated/prisma/client";

export interface ActionState {
  ok?: boolean;
  error?: string;
}
const ok: ActionState = { ok: true };

const TYPES: ContentPlanType[] = [
  "POST", "VIDEO", "STREAM", "STORY", "NEWSLETTER", "EVENT", "PRODUCT_DROP", "OTHER",
];
const STATUSES: ContentPlanStatus[] = [
  "DRAFT", "PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED",
];

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}
interface MediaInput {
  url: string;
  storageObjectId: string | null;
  contentType: string | null;
}

function parseType(v: unknown): ContentPlanType {
  const s = String(v ?? "");
  return (TYPES as string[]).includes(s) ? (s as ContentPlanType) : "POST";
}
function parseStatus(v: unknown): ContentPlanStatus {
  const s = String(v ?? "");
  return (STATUSES as string[]).includes(s) ? (s as ContentPlanStatus) : "DRAFT";
}
function parseDate(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function parseChecklist(raw: unknown): ChecklistItem[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: ChecklistItem[] = [];
  for (const it of arr.slice(0, 40)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const text = typeof r.text === "string" ? r.text.trim().slice(0, 200) : "";
    if (!text) continue;
    out.push({
      id: typeof r.id === "string" ? r.id : Math.random().toString(36).slice(2, 10),
      text,
      done: r.done === true,
    });
  }
  return out;
}
function parseMedia(raw: unknown): MediaInput[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: MediaInput[] = [];
  for (const it of arr.slice(0, 24)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const url = typeof r.url === "string" ? r.url.trim().slice(0, 600) : "";
    if (!url) continue;
    out.push({
      url,
      storageObjectId: typeof r.storageObjectId === "string" ? r.storageObjectId : null,
      contentType: typeof r.contentType === "string" ? r.contentType : null,
    });
  }
  return out;
}

async function resolveSpaceId(tenantId: string, raw: unknown): Promise<string | null> {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  const space = await prisma.space.findFirst({ where: { id, tenantId }, select: { id: true } });
  return space?.id ?? null;
}

export async function createContentPlanAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug);
  // Package gate — a downgraded client keeps working Server Action ids.
  const planBlocked = await featureBlocked(tenant.id, "planner");
  if (planBlocked) return { error: planBlocked };
  const title = String(fd.get("title") || "").trim().slice(0, 160);
  if (title.length < 2) return { error: "Titel fehlt." };

  const status = parseStatus(fd.get("status"));
  const media = parseMedia(fd.get("media"));
  const spaceId = await resolveSpaceId(tenant.id, fd.get("spaceId"));

  await withTenantTransaction(async (tx) => {
    const plan = await tx.contentPlan.create({
      data: {
        tenantId: tenant.id,
        createdById: user.id,
        title,
        description: String(fd.get("description") || "").trim().slice(0, 4000) || null,
        type: parseType(fd.get("type")),
        status,
        scheduledAt: parseDate(fd.get("scheduledAt")),
        completedAt: status === "COMPLETED" ? new Date() : null,
        spaceId,
        checklist: parseChecklist(fd.get("checklist")) as unknown as Prisma.InputJsonValue,
        aiNotes: String(fd.get("aiNotes") || "").trim().slice(0, 4000) || null,
      },
    });
    if (media.length) {
      await tx.contentPlanMedia.createMany({
        data: media.map((m, i) => ({
          tenantId: tenant.id,
          planId: plan.id,
          url: m.url,
          storageObjectId: m.storageObjectId,
          contentType: m.contentType,
          sortOrder: i,
        })),
      });
    }
  });
  await writeAudit({ tenantId: tenant.id, actorUserId: user.id, action: "plan.create" });
  revalidatePath(`/dashboard/${slug}/planner`);
  revalidatePath(`/dashboard/${slug}`);
  return ok;
}

export async function updateContentPlanAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  // Package gate — a downgraded client keeps working Server Action ids.
  const planBlocked = await featureBlocked(tenant.id, "planner");
  if (planBlocked) return { error: planBlocked };
  const planId = String(fd.get("planId"));
  const plan = await prisma.contentPlan.findFirst({ where: { id: planId, tenantId: tenant.id } });
  if (!plan) return { error: "Plan nicht gefunden." };

  const title = String(fd.get("title") || "").trim().slice(0, 160);
  if (title.length < 2) return { error: "Titel fehlt." };
  const status = parseStatus(fd.get("status"));
  const media = parseMedia(fd.get("media"));
  const spaceId = await resolveSpaceId(tenant.id, fd.get("spaceId"));

  await withTenantTransaction(async (tx) => {
    await tx.contentPlan.update({
      where: { id: plan.id },
      data: {
        title,
        description: String(fd.get("description") || "").trim().slice(0, 4000) || null,
        type: parseType(fd.get("type")),
        status,
        scheduledAt: parseDate(fd.get("scheduledAt")),
        completedAt: status === "COMPLETED" ? plan.completedAt ?? new Date() : null,
        spaceId,
        checklist: parseChecklist(fd.get("checklist")) as unknown as Prisma.InputJsonValue,
        aiNotes: String(fd.get("aiNotes") || "").trim().slice(0, 4000) || null,
      },
    });
    await tx.contentPlanMedia.deleteMany({ where: { planId: plan.id } });
    if (media.length) {
      await tx.contentPlanMedia.createMany({
        data: media.map((m, i) => ({
          tenantId: tenant.id,
          planId: plan.id,
          url: m.url,
          storageObjectId: m.storageObjectId,
          contentType: m.contentType,
          sortOrder: i,
        })),
      });
    }
  });
  revalidatePath(`/dashboard/${slug}/planner`);
  revalidatePath(`/dashboard/${slug}`);
  return ok;
}

export async function deleteContentPlanAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  const planId = String(fd.get("planId"));
  await prisma.contentPlan.deleteMany({ where: { id: planId, tenantId: tenant.id } });
  revalidatePath(`/dashboard/${slug}/planner`);
  revalidatePath(`/dashboard/${slug}`);
}

/** Quick status change from a plan card (e.g. mark complete / reopen). */
export async function setPlanStatusAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const { tenant } = await requireTenantAdmin(slug);
  // Package gate — a downgraded client keeps working Server Action ids.
  if (!(await tenantHasFeature(tenant.id, "planner"))) return;
  const planId = String(fd.get("planId"));
  const status = parseStatus(fd.get("status"));
  await prisma.contentPlan.updateMany({
    where: { id: planId, tenantId: tenant.id },
    data: { status, completedAt: status === "COMPLETED" ? new Date() : null },
  });
  revalidatePath(`/dashboard/${slug}/planner`);
  revalidatePath(`/dashboard/${slug}`);
}
