"use server";

import { revalidatePath } from "next/cache";
import { featureBlocked } from "@/lib/plan";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { tErr } from "@/lib/action-errors";

export interface AutomationState {
  error?: string;
  ok?: boolean;
}

const MAX_STEPS = 20;

export async function createAutomationStepAction(
  _p: AutomationState,
  fd: FormData,
): Promise<AutomationState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug);
  // Package gate — a downgraded client keeps working Server Action ids.
  const planBlocked = await featureBlocked(tenant.id, "automations");
  if (planBlocked) return { error: planBlocked };

  const dayOffset = Number(fd.get("dayOffset"));
  const subject = String(fd.get("subject") || "").trim().slice(0, 150);
  const body = String(fd.get("body") || "").trim().slice(0, 10_000);

  if (!Number.isFinite(dayOffset) || dayOffset < 0 || dayOffset > 365) {
    return { error: await tErr("dayBetween") };
  }
  if (subject.length < 2) return { error: await tErr("subjectRequired") };
  if (body.length < 2) return { error: await tErr("bodyRequired") };

  const count = await prisma.automationStep.count({
    where: { tenantId: tenant.id },
  });
  if (count >= MAX_STEPS) return { error: await tErr("maxSteps", { max: MAX_STEPS }) };

  await prisma.automationStep.create({
    data: {
      tenantId: tenant.id,
      dayOffset: Math.round(dayOffset),
      subject,
      body,
    },
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "automation.step.create",
    metadata: { dayOffset, subject },
  });
  revalidatePath(`/dashboard/${slug}/automations`);
  return { ok: true };
}

export async function toggleAutomationStepAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const id = String(fd.get("id"));
  const { tenant } = await requireTenantAdmin(slug);
  const step = await prisma.automationStep.findFirst({
    where: { id, tenantId: tenant.id },
  });
  if (step) {
    await prisma.automationStep.update({
      where: { id: step.id },
      data: { isActive: !step.isActive },
    });
  }
  revalidatePath(`/dashboard/${slug}/automations`);
}

export async function deleteAutomationStepAction(fd: FormData): Promise<void> {
  const slug = String(fd.get("tenant"));
  const id = String(fd.get("id"));
  const { tenant, user } = await requireTenantAdmin(slug);
  await prisma.automationStep.deleteMany({
    where: { id, tenantId: tenant.id },
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "automation.step.delete",
    metadata: { id },
  });
  revalidatePath(`/dashboard/${slug}/automations`);
}
