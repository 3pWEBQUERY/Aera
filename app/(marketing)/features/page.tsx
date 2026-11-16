import { getTranslations } from "next-intl/server";
import { PillLink } from "@/components/marketing/pill-link";
import { Reveal } from "@/components/marketing/reveal";
import { PlanAvailability, type GatedItem } from "@/components/marketing/plan-availability";
import { SPACE_TYPE_KEYS } from "@/lib/plan-features";

export async function generateMetadata() {
  const t = await getTranslations("ui.auth");
  return { title: t("featuresMeta") };
}

/* 13 Feature-Sektionen — Texte liegen lokalisiert unter features.sections.* */
const SECTION_IDS = [
  "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13",
] as const;

/**
 * Was in einer Sektion beworben wird, aber ein bezahltes Paket braucht. Die
 * Paketzuordnung selbst kommt aus lib/plan-features.ts; hier steht nur, welche
 * Funktion zu welchem Text gehoert.
 */
const SECTION_GATES: Partial<Record<(typeof SECTION_IDS)[number], GatedItem[]>> = {
  s1: [{ feature: "customDomain" }],
  s2: [{ space: "SHOP" }, { space: "CHAT" }, { space: "PODCAST" }, { space: "ADS" }],
  s4: [{ feature: "products" }],
  s7: [{ space: "CHAT" }, { space: "LIVE" }],
  s8: [{ space: "PODCAST" }],
  s9: [{ feature: "gamification" }],
  s13: [{ feature: "export" }],
};

export default async function FeaturesPage() {
  const t = await getTranslations("features");
  const vars = { count: SPACE_TYPE_KEYS.length };

  return (
    <main className="bg-[#f4f1ea] text-[#161613]">
      <div className="mx-auto max-w-7xl px-5 pb-24 pt-16 md:pt-24">
        {/* Intro */}
        <div className="max-w-3xl">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/65 sm:text-sm">
              {t("eyebrow")}
            </p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="display-serif mt-5 text-5xl leading-[1.04] sm:text-6xl md:text-7xl">
              {t("titleA")}
              <br />
              <span className="text-[#161613]/65">{t("titleB")}</span>
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#161613]/70">
              {t("intro")}
            </p>
          </Reveal>
        </div>

        {/* Editorial-Liste */}
        <div className="mt-16">
          {SECTION_IDS.map((id, i) => (
            <Reveal key={id} delay={i * 50}>
              <article className="grid gap-5 border-t border-[#161613]/15 py-10 md:grid-cols-[80px_1.1fr_1fr] md:gap-10 md:py-12">
                <p className="display-serif text-2xl text-[#161613]/65 md:text-3xl">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h2 className="display-serif text-3xl leading-[1.12] sm:text-4xl">
                  {t(`sections.${id}.title`)}
                </h2>
                <div>
                  <p className="text-base leading-7 text-[#161613]/70">
                    {t(`sections.${id}.text`)}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(["tag1", "tag2", "tag3"] as const).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[#161613]/20 px-3.5 py-1.5 text-sm font-semibold text-[#161613]/80"
                      >
                        {t(`sections.${id}.${tag}`, vars)}
                      </span>
                    ))}
                  </div>
                  {SECTION_GATES[id] && (
                    <PlanAvailability items={SECTION_GATES[id]} className="mt-4" />
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        {/* CTA */}
        <Reveal>
          <div className="flex flex-col gap-3 border-t border-[#161613]/15 pt-12 sm:flex-row">
            <PillLink href="/signup?next=/start" tone="dark">
              {t("ctaStart")}
            </PillLink>
            <PillLink href="/pricing" tone="outline-dark">
              {t("ctaPricing")}
            </PillLink>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
