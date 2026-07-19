"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import prisma, { setTenantContext } from "@/lib/prisma";
import {
  optInToNewsletter,
  withdrawNewsletterConsent,
  withdrawNewsletterConsentByToken,
} from "@/lib/marketing-consent";
import { writeAudit } from "@/lib/audit";

export interface NewsletterPreferenceState {
  ok?: boolean;
  error?: string;
}

export async function setNewsletterConsentAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const tenantId = String(fd.get("tenantId") || "");
  const intent = String(fd.get("intent") || "");
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId: user.id, status: "ACTIVE" },
    select: { tenantId: true },
  });
  if (!membership || (intent !== "opt-in" && intent !== "withdraw")) return;
  setTenantContext(membership.tenantId);
  if (intent === "opt-in") {
    await optInToNewsletter({
      tenantId: membership.tenantId,
      userId: user.id,
      email: user.email,
      source: "MEMBER_ACCOUNT",
    });
  } else {
    await withdrawNewsletterConsent({
      tenantId: membership.tenantId,
      userId: user.id,
      email: user.email,
      source: "MEMBER_ACCOUNT",
    });
  }
  await writeAudit({
    tenantId: membership.tenantId,
    actorUserId: user.id,
    action: intent === "opt-in" ? "newsletter.consent.opt_in" : "newsletter.consent.withdraw",
  });
  revalidatePath("/member/account");
}

export async function unsubscribeNewsletterAction(
  _previous: NewsletterPreferenceState,
  fd: FormData,
): Promise<NewsletterPreferenceState> {
  const token = String(fd.get("token") || "");
  const ok = await withdrawNewsletterConsentByToken(token, "EMAIL_FOOTER");
  return ok ? { ok: true } : { error: "invalid" };
}
