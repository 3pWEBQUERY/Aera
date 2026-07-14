import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingChrome } from "@/components/marketing/marketing-chrome";
import logo from "@/public/logo.svg";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("uiMigration.auth");
  return { title: { template: "%s — Aera", default: t("rootTitle") } };
}

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const t = await getTranslations("marketing");

  return (
    <div className="min-h-screen bg-[#0f0f0d]">
      <MarketingChrome
        header={<MarketingHeader loggedIn={Boolean(user)} />}
        footer={
          <footer className="bg-[#0f0f0d] text-white">
            <div className="mx-auto max-w-7xl px-5 pt-16">
              <Image
                src={logo}
                alt="Aera"
                className="h-16 w-auto sm:h-24"
              />
            </div>
            <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-12 pt-10 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
              <p className="max-w-md text-sm leading-6 text-white/55">
                {t("footerAbout")}
              </p>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
                  {t("footerProduct")}
                </p>
                <div className="mt-4 grid gap-3 text-sm font-medium text-white/65">
                  <Link href="/features" className="transition-colors hover:text-white">
                    {t("navFeatures")}
                  </Link>
                  <Link href="/pricing" className="transition-colors hover:text-white">
                    {t("navPricing")}
                  </Link>
                  <Link href="/home" className="transition-colors hover:text-white">
                    {t("footerDiscover")}
                  </Link>
                  <Link href="/hilfe" className="transition-colors hover:text-white">
                    {t("footerHelpCenter")}
                  </Link>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
                  {t("footerGetStarted")}
                </p>
                <div className="mt-4 grid gap-3 text-sm font-medium text-white/65">
                  <Link href="/signup?next=/start" className="transition-colors hover:text-white">
                    {t("startCommunity")}
                  </Link>
                  <Link href="/login" className="transition-colors hover:text-white">
                    {t("login")}
                  </Link>
                  <Link href="/start" className="transition-colors hover:text-white">
                    {t("footerOnboarding")}
                  </Link>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
                  Aera.so
                </p>
                <div className="mt-4 grid gap-3 text-sm font-medium text-white/65">
                  <Link href="/impressum" className="transition-colors hover:text-white">
                    {t("footerImprint")}
                  </Link>
                  <Link href="/agb" className="transition-colors hover:text-white">
                    {t("footerTerms")}
                  </Link>
                  <Link href="/datenschutz" className="transition-colors hover:text-white">
                    {t("footerPrivacy")}
                  </Link>
                  <Link href="/widerruf" className="transition-colors hover:text-white">
                    {t("footerWithdrawal")}
                  </Link>
                </div>
              </div>
            </div>
            <div className="border-t border-white/10">
              <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-5 text-sm text-white/40 sm:flex-row sm:items-center sm:justify-between">
                <span>© {new Date().getFullYear()} Aera.so</span>
                <span>{t("footerTagline")}</span>
              </div>
            </div>
          </footer>
        }
      >
        <div className="bg-[#f4f1ea]">{children}</div>
      </MarketingChrome>
    </div>
  );
}
