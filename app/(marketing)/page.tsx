import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/marketing/reveal";
import { PillLink } from "@/components/marketing/pill-link";
import { HeroFrameBackground } from "@/components/marketing/hero-frame-background";
import { FINALE_CLIPS } from "@/components/marketing/hero-clips";

/* Poster-Kacheln für die Marquee: alle 14 echten Space-Typen (Text-Keys in
   messages/<locale>.json unter home.tiles.*). */
const TILE_IDS = [
  "feed", "forum", "course", "shop", "newsletter", "events", "blog",
  "knowledge", "gallery", "videos", "chat", "podcast", "links", "ads",
] as const;

const CHAPTER_IDS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"] as const;
const REVENUE_IDS = ["tiers", "products", "paidAccess", "events"] as const;
const OWNERSHIP_IDS = ["brand", "address", "data"] as const;

const tileTones = [
  "bg-[#ece7dc] text-[#161613]",
  "bg-[#21372b] text-[#ece7dc]",
  "bg-[#c8553a] text-[#f7f1e8]",
  "bg-[#1c1c19] text-[#ece7dc]",
  "bg-[#d8d1f0] text-[#241458]",
];

export default async function LandingPage() {
  const t = await getTranslations("home");

  const spaceTiles = TILE_IDS.map((id) => ({
    name: t(`tiles.${id}.name`),
    hint: t(`tiles.${id}.hint`),
  }));

  return (
    <main className="-mt-20 bg-[#0f0f0d] text-white">
      {/* Hero — reicht unter den transparenten (sticky) Header, damit der
          bewegte Hintergrund auch hinter dem Header sichtbar ist. */}
      <section className="overflow-hidden">
        <div className="relative isolate bg-[#0f0f0d]">
          {/* Bewegter Hintergrund aus den FFmpeg-Frame-Sequenzen (auto-Wechsel). */}
          <HeroFrameBackground className="absolute inset-0 -z-10 overflow-hidden" />
          {/* Oben klar (Header liegt transparent über dem bewegten Hintergrund),
              darunter abgedunkelt für die Textlesbarkeit + weicher Übergang zur Marquee. */}
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,transparent_0%,rgba(15,15,13,0.15)_16%,rgba(15,15,13,0.55)_55%,#0f0f0d_100%)]" />
          <div className="mx-auto max-w-7xl px-5 pb-10 pt-36 md:pt-44">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60 sm:text-sm">
              {t("badge")}
            </p>
          </Reveal>
          <h1 className="display-serif mt-6 max-w-5xl text-5xl leading-[1.02] sm:text-7xl md:text-8xl">
            <Reveal delay={100}>
              <span className="block">{t("heroLine1")}</span>
            </Reveal>
            <Reveal delay={220}>
              <span className="block">{t("heroLine2")}</span>
            </Reveal>
            <Reveal delay={340}>
              <span className="block text-white/60">{t("heroLine3")}</span>
            </Reveal>
          </h1>
          <Reveal delay={460}>
            <p className="mt-8 max-w-xl text-lg leading-8 text-white/70">
              {t("heroText")}
            </p>
          </Reveal>
          <Reveal delay={580}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <PillLink href="/signup?next=/start" tone="light">
                {t("ctaStart")}
              </PillLink>
              <PillLink href="/features" tone="outline-light">
                {t("ctaFeatures")}
              </PillLink>
            </div>
          </Reveal>
          </div>
        </div>

        {/* Marquee: die 14 echten Space-Typen als Poster-Kacheln */}
        <Reveal delay={200}>
          <div className="marquee overflow-hidden pb-16 pt-6">
            <div className="marquee-track flex w-max gap-4 pr-4">
              {[...spaceTiles, ...spaceTiles].map((tile, i) => (
                <div
                  key={`${tile.name}-${i}`}
                  className={`flex h-44 w-60 shrink-0 flex-col justify-between rounded-2xl p-5 transition-transform duration-300 hover:-translate-y-1.5 sm:h-48 sm:w-64 ${tileTones[i % tileTones.length]}`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-60">
                    {t("tileBadge")}
                  </span>
                  <div>
                    <p className="display-serif text-3xl leading-none">
                      {tile.name}
                    </p>
                    <p className="mt-2 text-sm font-medium opacity-70">
                      {tile.hint}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* Statement */}
      <section className="bg-[#f4f1ea] text-[#161613]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:py-28">
          <Reveal>
            <h2 className="display-serif max-w-4xl text-4xl leading-[1.08] sm:text-6xl">
              {t("statementA")}
              <span className="text-[#161613]/50"> {t("statementB")}</span>
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[#161613]/70">
              {t("statementText")}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Kapitel: die Produktbereiche als Editorial-Liste */}
      <section className="bg-[#f4f1ea] text-[#161613]" id="features">
        <div className="mx-auto max-w-7xl px-5 pb-24">
          {CHAPTER_IDS.map((id, i) => (
            <Reveal key={id} delay={i * 60}>
              <article className="grid gap-6 border-t border-[#161613]/15 py-10 md:grid-cols-[80px_1.1fr_1fr] md:gap-10 md:py-14">
                <p className="display-serif text-2xl text-[#161613]/40 md:text-3xl">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="display-serif text-3xl leading-[1.1] sm:text-4xl md:text-5xl">
                  {t(`chapters.${id}.title`)}
                </h3>
                <div>
                  <p className="text-base leading-7 text-[#161613]/70">
                    {t(`chapters.${id}.text`)}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(["tag1", "tag2", "tag3"] as const).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[#161613]/20 px-3.5 py-1.5 text-sm font-semibold text-[#161613]/80"
                      >
                        {t(`chapters.${id}.${tag}`)}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
          <Reveal>
            <div className="border-t border-[#161613]/15 pt-10">
              <PillLink href="/features" tone="dark">
                {t("chaptersCta")}
              </PillLink>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Monetarisierung */}
      <section className="bg-[#0f0f0d]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div>
              <Reveal>
                <h2 className="display-serif text-4xl leading-[1.08] sm:text-6xl">
                  {t("revenueA")}
                  <br />
                  <span className="text-white/55">{t("revenueB")}</span>
                </h2>
              </Reveal>
              <Reveal delay={150}>
                <p className="mt-8 max-w-md text-lg leading-8 text-white/65">
                  {t("revenueText")}
                </p>
              </Reveal>
              <Reveal delay={250}>
                <div className="mt-8">
                  <PillLink href="/pricing" tone="outline-light">
                    {t("revenueCta")}
                  </PillLink>
                </div>
              </Reveal>
            </div>
            <div>
              {REVENUE_IDS.map((id, i) => (
                <Reveal key={id} delay={i * 90}>
                  <div className="group flex flex-col justify-between gap-1 border-t border-white/15 py-6 transition-colors duration-200 hover:border-white/40 sm:flex-row sm:items-baseline sm:gap-6">
                    <p className="display-serif text-2xl sm:text-3xl">
                      {t(`revenue.${id}.name`)}
                    </p>
                    <p className="text-sm text-white/55 sm:text-right">
                      {t(`revenue.${id}.detail`)}
                    </p>
                  </div>
                </Reveal>
              ))}
              <div className="border-t border-white/15" />
            </div>
          </div>
        </div>
      </section>

      {/* Ownership */}
      <section className="bg-[#f4f1ea] text-[#161613]">
        <div className="mx-auto max-w-7xl px-5 py-20 md:py-28">
          <div className="grid gap-10 md:grid-cols-3 md:gap-8">
            {OWNERSHIP_IDS.map((id, i) => (
              <Reveal key={id} delay={i * 120}>
                <div>
                  <h3 className="display-serif text-3xl sm:text-4xl">
                    {t(`ownership.${id}.title`)}
                  </h3>
                  <p className="mt-4 text-base leading-7 text-[#161613]/70">
                    {t(`ownership.${id}.text`)}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Finale */}
      <section className="relative isolate overflow-hidden border-b border-white/10 bg-[#0f0f0d]">
        {/* Ruhiger Video-Hintergrund (videos/4.mp4) als Frame-Sequenz. */}
        <HeroFrameBackground
          className="absolute inset-0 -z-10 overflow-hidden"
          clips={FINALE_CLIPS}
        />
        {/* Radiales Overlay: in der Mitte dunkler → zentrierter Text bleibt lesbar. */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(15,15,13,0.78)_0%,rgba(15,15,13,0.68)_45%,rgba(15,15,13,0.92)_100%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-24 text-center md:py-36">
          <Reveal>
            <h2 className="display-serif mx-auto max-w-4xl text-5xl leading-[1.04] sm:text-7xl">
              {t("finaleA")}
              <br />
              <span className="text-white/55">{t("finaleB")}</span>
            </h2>
          </Reveal>
          <Reveal delay={180}>
            <p className="mx-auto mt-8 max-w-xl text-lg leading-8 text-white/65">
              {t("finaleText")}
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PillLink href="/signup?next=/start" tone="light">
                {t("finaleCtaStart")}
              </PillLink>
              <PillLink href="/pricing" tone="outline-light">
                {t("finaleCtaPricing")}
              </PillLink>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
