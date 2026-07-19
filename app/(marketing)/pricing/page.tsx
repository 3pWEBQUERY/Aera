import { getLocale, getTranslations } from "next-intl/server";
import { MarketingPlanCard } from "@/components/marketing/marketing-plan-card";
import { PillLink } from "@/components/marketing/pill-link";
import { Reveal } from "@/components/marketing/reveal";
import {
  PLAN_ORDER,
  PLANS,
  FEATURED_PLAN,
  CREDIT_PACKS,
  creatorPlanSignupHref,
} from "@/lib/credit-plans";
import { formatPrice } from "@/lib/utils";
import { PLATFORM_CURRENCY } from "@/lib/currency";

export async function generateMetadata() {
  const t = await getTranslations("uiMigration.auth");
  return { title: t("pricingMeta") };
}

export default async function PricingPage() {
  const t = await getTranslations("pricing");
  const tpc = await getTranslations("community.render.planCard");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale);

  return (
    <main className="bg-[#f4f1ea] text-[#161613]">
      <div className="mx-auto max-w-7xl px-5 pb-24 pt-16 md:pt-24">
        {/* Intro */}
        <div className="max-w-3xl">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/50 sm:text-sm">
              {t("eyebrow")}
            </p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="display-serif mt-5 text-5xl leading-[1.04] sm:text-6xl md:text-7xl">
              {t("titleA")}
              <br />
              <span className="text-[#161613]/50">{t("titleB")}</span>
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#161613]/70">
              {t("intro")}
            </p>
          </Reveal>
        </div>

        {/* Pakete — Taglines/Features kommen lokalisiert aus dem Katalog. */}
        <div className="mt-14 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((key, i) => {
            const plan = PLANS[key];
            const featured = key === FEATURED_PLAN;
            return (
              <Reveal key={plan.key} delay={i * 90} className="h-full">
                <MarketingPlanCard
                  name={plan.name}
                  tagline={t(`plans.${key}.tagline`)}
                  priceCents={plan.priceCents}
                  features={[
                    t(`plans.${key}.f1`),
                    t(`plans.${key}.f2`),
                    t(`plans.${key}.f3`),
                    t(`plans.${key}.f4`),
                  ]}
                  featured={featured}
                  labels={{
                    locale,
                    popular: tpc("popular"),
                    perMonth: tpc("perMonth"),
                    credits: tpc("creditsPerMonth", { count: nf.format(plan.monthlyCredits) }),
                    storage: t("storageChip", { gb: nf.format(plan.storageGb) }),
                  }}
                >
                  <PillLink
                    href={creatorPlanSignupHref(key)}
                    tone={featured ? "light" : "outline-dark"}
                    className="w-full"
                  >
                    {plan.priceCents === 0
                      ? t("ctaFree")
                      : t("ctaChoose", { name: plan.name })}
                  </PillLink>
                </MarketingPlanCard>
              </Reveal>
            );
          })}
        </div>

        {/* Credits nachkaufen */}
        <Reveal>
          <div className="mt-20 grid gap-8 border-t border-[#161613]/15 pt-12 md:grid-cols-[1fr_1.2fr] md:gap-14">
            <div>
              <h2 className="display-serif text-3xl leading-tight sm:text-4xl">
                {t("topupTitle")}
              </h2>
              <p className="mt-4 max-w-md text-base leading-7 text-[#161613]/70">
                {t("topupText")}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {CREDIT_PACKS.map((pack, i) => (
                <Reveal key={pack.id} delay={i * 90}>
                  <div className="flex h-full flex-col justify-between rounded-2xl border border-[#161613]/10 bg-white p-5 transition-transform duration-300 hover:-translate-y-1">
                    <div>
                      <p className="display-serif text-3xl">
                        {nf.format(pack.credits)}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#161613]/45">
                        {t("creditsLabel")}
                      </p>
                    </div>
                    <p className="mt-6 text-sm font-semibold text-[#161613]/80">
                      {formatPrice(pack.priceCents, PLATFORM_CURRENCY, locale)}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Fußnote */}
        <Reveal>
          <p className="mt-14 max-w-2xl text-sm leading-6 text-[#161613]/50">
            {t("footnote")}
          </p>
        </Reveal>
      </div>
    </main>
  );
}
