import { getLocale, getTranslations } from "next-intl/server";

/**
 * Gemeinsamer Rahmen für Rechtsseiten (Impressum, AGB, Datenschutz, Widerruf).
 * Marketing-Look: helle Fläche, Serif-Überschriften, ruhige Typografie.
 *
 * Hinweis: Die Rechtstexte sind bewusst deutschsprachig (Vertragssprache des
 * Betreibers) und werden nicht über die i18n-Kataloge lokalisiert. Wer Aera in
 * einer anderen Sprache nutzt, bekommt deshalb oben einen übersetzten Hinweis,
 * dass nur die deutsche Fassung gilt (`germanOnly`, Standard: an).
 */
export async function LegalShell({
  eyebrow,
  title,
  updated,
  germanOnly = true,
  children,
}: {
  eyebrow: string;
  title: string;
  /** z. B. "Stand: Juli 2026" */
  updated?: string;
  /** Der Inhalt ist deutscher Rechtstext (nicht übersetzt). */
  germanOnly?: boolean;
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const showNotice = germanOnly && locale !== "de";
  const t = showNotice ? await getTranslations("marketing") : null;

  return (
    // Der Rechtstext ist deutsch — Screenreader sollen ihn auch so vorlesen.
    <main lang={germanOnly ? "de" : undefined} className="bg-[#f4f1ea] text-[#161613]">
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-16 md:pt-24">
        {t && (
          <p
            lang={locale}
            className="mb-8 rounded-xl border border-[#161613]/15 bg-white px-4 py-3 text-sm leading-6 text-[#161613]/75"
          >
            {t("legalGermanOnly")}
          </p>
        )}
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/65">
          {eyebrow}
        </p>
        <h1 className="display-serif mt-4 text-4xl leading-[1.05] sm:text-5xl">
          {title}
        </h1>
        {updated && (
          <p className="mt-3 text-sm text-[#161613]/65">{updated}</p>
        )}
        <div className="legal-prose mt-10 space-y-8 text-[15px] leading-7 text-[#161613]/80 [&_h2]:display-serif [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:text-[#161613] [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[#161613] [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </div>
    </main>
  );
}
