"use server";

import { revalidatePath } from "next/cache";
import { systemPrisma } from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { tErr } from "@/lib/action-errors";

export interface ReferralSettingsState {
  error?: string;
  ok?: boolean;
}

/** Provision (in %) auf bezahlte Käufe geworbener Mitglieder speichern. */
export async function updateReferralSettingsAction(
  _p: ReferralSettingsState,
  fd: FormData,
): Promise<ReferralSettingsState> {
  const slug = String(fd.get("tenant"));
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");

  const raw = String(fd.get("referralPercent") ?? "").replace(",", ".");
  const percent = Number(raw);
  if (!Number.isFinite(percent) || percent < 0 || percent > 50) {
    return { error: await tErr("commissionRange") };
  }

  await systemPrisma.tenant.update({
    where: { id: tenant.id },
    data: { referralPercent: percent },
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "referrals.settings.update",
    metadata: { referralPercent: percent },
  });
  revalidatePath(`/dashboard/${slug}/referrals`);
  return { ok: true };
}
