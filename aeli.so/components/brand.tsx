import Link from "next/link";

/**
 * Die Wortmarke.
 *
 * Der Punkt hinter dem Namen ist die ganze Idee: eine Aeli-Seite ist ein
 * Endpunkt — hier hört das Suchen auf. Er ist das einzige farbige Element im
 * Logo und taucht als Form in der Marke wieder auf (Favicon, Ladepunkt,
 * Live-Indikator).
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-semibold tracking-tight ${className}`}>
      <span>aeli</span>
      <span aria-hidden className="ml-[0.09em] size-[0.3em] translate-y-[-0.02em] rounded-full bg-signal" />
    </span>
  );
}

export function BrandLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center rounded-lg text-lg text-chalk transition-opacity hover:opacity-75 ${className}`}
    >
      <Wordmark />
      <span className="sr-only">Aeli Startseite</span>
    </Link>
  );
}
