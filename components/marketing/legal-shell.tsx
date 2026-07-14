/**
 * Gemeinsamer Rahmen für Rechtsseiten (Impressum, AGB, Datenschutz, Widerruf).
 * Marketing-Look: helle Fläche, Serif-Überschriften, ruhige Typografie.
 *
 * Hinweis: Die Rechtstexte sind bewusst deutschsprachig (Vertragssprache des
 * Betreibers) und werden nicht über die i18n-Kataloge lokalisiert.
 */
export function LegalShell({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  /** z. B. "Stand: Juli 2026" */
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="bg-[#f4f1ea] text-[#161613]">
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-16 md:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/50">
          {eyebrow}
        </p>
        <h1 className="display-serif mt-4 text-4xl leading-[1.05] sm:text-5xl">
          {title}
        </h1>
        {updated && (
          <p className="mt-3 text-sm text-[#161613]/50">{updated}</p>
        )}
        <div className="legal-prose mt-10 space-y-8 text-[15px] leading-7 text-[#161613]/80 [&_h2]:display-serif [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:text-[#161613] [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[#161613] [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </div>
    </main>
  );
}
