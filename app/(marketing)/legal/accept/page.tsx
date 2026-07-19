import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CurrentLegalAcceptanceForm } from "@/components/forms/account-forms";
import { LegalShell } from "@/components/marketing/legal-shell";
import { getCurrentUser } from "@/lib/auth";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal";
import { hasCurrentLegalEvidence } from "@/lib/legal-evidence";

export default async function LegalAcceptancePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext =
    next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
      ? next
      : "/home";
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/legal/accept?next=${safeNext}`)}`);
  if (await hasCurrentLegalEvidence(user.id)) redirect(safeNext);

  const t = await getTranslations("legalReview");
  return (
    <LegalShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      updated={
        CURRENT_TERMS_VERSION === CURRENT_PRIVACY_VERSION
          ? `Version ${CURRENT_TERMS_VERSION}`
          : `Version ${CURRENT_TERMS_VERSION} / ${CURRENT_PRIVACY_VERSION}`
      }
    >
      <p>{t("description")}</p>
      <div className="rounded-2xl border border-[#161613]/10 bg-white p-5 sm:p-6">
        <CurrentLegalAcceptanceForm next={safeNext} />
      </div>
    </LegalShell>
  );
}
