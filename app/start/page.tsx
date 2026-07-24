import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/guards";
import { env } from "@/lib/env";
import { creatorPlanStartPath, parsePlanKey } from "@/lib/credit-plans";
import { normalizePromoCode } from "@/lib/promo-codes";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("metaTitle") };
}

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; code?: string }>;
}) {
  const { plan: rawPlan, code: rawCode } = await searchParams;
  const selectedPlan = parsePlanKey(rawPlan) ?? "FREE";
  // Influencer links carry the code straight into the wizard (/start?code=…).
  const initialCode = normalizePromoCode(rawCode);
  const user = await requireUser(creatorPlanStartPath(selectedPlan));
  return (
    <OnboardingWizard
      rootDomain={env.ROOT_DOMAIN}
      appUrl={env.APP_URL.replace(/\/+$/, "")}
      user={{ name: user.name, avatarUrl: user.avatarUrl }}
      selectedPlan={selectedPlan}
      initialCode={initialCode}
    />
  );
}
