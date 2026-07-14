import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/guards";
import { env } from "@/lib/env";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("metaTitle") };
}

export default async function StartPage() {
  const user = await requireUser("/start");
  return (
    <OnboardingWizard
      rootDomain={env.ROOT_DOMAIN}
      user={{ name: user.name, avatarUrl: user.avatarUrl }}
    />
  );
}
