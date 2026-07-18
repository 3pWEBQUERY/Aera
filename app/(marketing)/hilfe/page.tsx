import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { Icon } from "@/components/dashboard/icons";
import { Reveal } from "@/components/marketing/reveal";
import { PillLink } from "@/components/marketing/pill-link";

export async function generateMetadata() {
  const t = await getTranslations("help");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function HelpCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim().slice(0, 80);
  const t = await getTranslations("help");

  const locale = await getLocale();
  const loadForLocale = (loc: string) =>
    prisma.helpCategory.findMany({
      where: { locale: loc },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        articles: {
          where: { isPublished: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  // Show the active language; fall back to English, then German, if a language
  // has no content yet (mirrors Aeras UI fallback model).
  let categories = await loadForLocale(locale);
  let filled = categories.filter((c) => c.articles.length > 0);
  if (filled.length === 0 && locale !== "en") {
    categories = await loadForLocale("en");
    filled = categories.filter((c) => c.articles.length > 0);
  }
  if (filled.length === 0 && locale !== "de") {
    categories = await loadForLocale("de");
    filled = categories.filter((c) => c.articles.length > 0);
  }

  // Search: flat result list across all categories.
  const needle = query.toLowerCase();
  const results = query
    ? filled.flatMap((c) =>
        c.articles
          .filter(
            (a) =>
              a.question.toLowerCase().includes(needle) ||
              a.answer.toLowerCase().includes(needle),
          )
          .map((a) => ({ ...a, categoryTitle: c.title })),
      )
    : [];

  return (
    <main className="bg-[#f4f1ea] text-[#161613]">
      {/* Hero mit Suche */}
      <section className="border-b border-[#161613]/10 bg-[#0f0f0d] text-white">
        <div className="mx-auto max-w-3xl px-5 pb-14 pt-16 text-center md:pb-16 md:pt-20">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              {t("eyebrow")}
            </p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="display-serif mt-4 text-4xl leading-[1.05] sm:text-6xl">
              {t("heroTitle")}
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <form method="GET" action="/hilfe" className="mx-auto mt-8 max-w-xl">
              <div className="flex items-center gap-3 rounded-full bg-white py-2 pl-5 pr-2 text-[#161613]">
                <Icon name="search" size={20} className="shrink-0 text-[#161613]/40" />
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchAria")}
                  className="w-full bg-transparent py-2 text-base outline-none placeholder:text-[#161613]/40"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-full bg-[#161613] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#33332e]"
                >
                  {t("searchSubmit")}
                </button>
              </div>
            </form>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 pb-24 pt-12">
        {filled.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#161613]/20 px-6 py-14 text-center text-sm text-[#161613]/50">
            {t("comingSoon")}
          </p>
        ) : query ? (
          /* ------------------------------------------------ Suchergebnisse */
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="display-serif text-2xl sm:text-3xl">
                {results.length === 0
                  ? t("noResults", { query })
                  : t("resultsCount", { count: results.length, query })}
              </h2>
              <Link
                href="/hilfe"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#161613]/15 bg-white px-4 py-2 text-sm font-semibold text-[#161613]/70 transition hover:border-[#161613]/40 hover:text-[#161613]"
              >
                <Icon name="close" size={14} />
                {t("resetSearch")}
              </Link>
            </div>
            <div className="mt-6 space-y-3">
              {results.map((a) => (
                <details
                  key={a.id}
                  className="group rounded-2xl border border-[#161613]/10 bg-white"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#161613]/45">
                        {a.categoryTitle}
                      </span>
                      <span className="mt-0.5 block font-semibold">{a.question}</span>
                    </span>
                    <Icon
                      name="chevron"
                      size={17}
                      className="shrink-0 text-[#161613]/40 transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <div className="border-t border-[#161613]/10 px-5 py-4">
                    <p className="whitespace-pre-line text-sm leading-7 text-[#161613]/75">
                      {a.answer}
                    </p>
                  </div>
                </details>
              ))}
            </div>
          </>
        ) : (
          /* ----------------------------------------- Kategorien + Q&A */
          <>
            {/* Kategorie-Kacheln (Sprungmarken) */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filled.map((c, i) => (
                <Reveal key={c.id} delay={i * 60}>
                  <a
                    href={`#${c.slug}`}
                    className="group flex h-full flex-col rounded-2xl border border-[#161613]/10 bg-white p-5 transition duration-300 hover:-translate-y-1 hover:border-[#161613]/30"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#161613]/5 text-[#161613]/60">
                      <Icon name="knowledge" size={18} />
                    </span>
                    <span className="display-serif mt-4 text-xl leading-tight">
                      {c.title}
                    </span>
                    {c.description && (
                      <span className="mt-1.5 text-sm leading-6 text-[#161613]/60">
                        {c.description}
                      </span>
                    )}
                    <span className="mt-auto pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#161613]/45">
                      {t("articleCount", { count: c.articles.length })}
                    </span>
                  </a>
                </Reveal>
              ))}
            </div>

            {/* Q&A pro Kategorie */}
            <div className="mt-16 space-y-14">
              {filled.map((c) => (
                <section key={c.id} id={c.slug} className="scroll-mt-24">
                  <div className="border-b border-[#161613]/15 pb-4">
                    <h2 className="display-serif text-2xl sm:text-3xl">{c.title}</h2>
                    {c.description && (
                      <p className="mt-1.5 text-sm leading-6 text-[#161613]/60">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 space-y-3">
                    {c.articles.map((a) => (
                      <details
                        key={a.id}
                        className="group rounded-2xl border border-[#161613]/10 bg-white"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                          {a.question}
                          <Icon
                            name="chevron"
                            size={17}
                            className="shrink-0 text-[#161613]/40 transition-transform group-open:rotate-180"
                          />
                        </summary>
                        <div className="border-t border-[#161613]/10 px-5 py-4">
                          <p className="whitespace-pre-line text-sm leading-7 text-[#161613]/75">
                            {a.answer}
                          </p>
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}

        {/* Kontakt-Abschluss */}
        <div className="mt-20 flex flex-col items-start justify-between gap-6 rounded-2xl bg-[#161613] p-7 text-white sm:flex-row sm:items-center sm:p-9">
          <div>
            <h2 className="display-serif text-2xl">{t("contactTitle")}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/65">
              {t("contactText")}
            </p>
          </div>
          <PillLink href="/signup?next=/start" tone="light" className="shrink-0">
            {t("contactCta")}
          </PillLink>
        </div>
      </div>
    </main>
  );
}
