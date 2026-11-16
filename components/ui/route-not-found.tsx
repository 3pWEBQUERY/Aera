/**
 * Inhalt der `not-found.tsx` in Dashboard, Community und Admin.
 *
 * Sitzt im Inhaltsbereich des jeweiligen Layouts — Navigation und Branding
 * bleiben stehen, man muss nicht ueber die Adresszeile zurueck. Die
 * Plattform-weite 404 (app/not-found.tsx) bleibt die grosse Bildseite.
 */
export function RouteNotFound({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  /** Der Weg zurueck, z. B. „Zurueck zu {community}“. */
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center px-4 py-16 sm:py-24">
      <div className="w-full max-w-md rounded-2xl border border-[#161613]/10 bg-white p-8 text-center shadow-sm">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">404</p>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
        <div className="mt-6 flex justify-center">{action}</div>
      </div>
    </div>
  );
}

/** Gefuellter Link-Button fuer `action` — gleiche Optik wie „Neu laden“. */
export const routeActionClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2";
