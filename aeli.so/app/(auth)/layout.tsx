import Link from "next/link";
import { BrandLink } from "@/components/brand";

/**
 * Zweispaltig ab `lg`, darunter nur das Formular.
 *
 * Die linke Spalte ist kein Dekor: sie beantwortet die Frage, die jemand beim
 * Anlegen eines Kontos hat („was bekomme ich dafür?“). Auf dem Handy fällt sie
 * weg — dort ist der Bildschirm für das Formular da, nicht für Argumente.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-ink-2 p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-40 size-[36rem] rounded-full bg-signal/12 blur-[110px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-52 -right-32 size-[32rem] rounded-full bg-ember/10 blur-[120px]"
        />

        <BrandLink className="relative" />

        <div className="relative max-w-md">
          <p className="text-4xl leading-[1.1] font-semibold tracking-tight text-chalk">
            Eine Adresse.
            <br />
            <span className="text-ash">Alles, was du machst.</span>
          </p>
          <p className="mt-6 text-base leading-relaxed text-ash">
            Aeli gibt dir <span className="text-chalk">deinname.aeli.so</span> — eine Seite, die in
            zehn Minuten steht, auf jedem Handy sofort lädt und dir sagt, worauf wirklich geklickt
            wird.
          </p>
        </div>

        <ul className="relative space-y-3 text-sm text-ash">
          {[
            "Eigener Handle als Subdomain, kein /u/kryptischer-pfad",
            "Statistik ohne Cookie-Banner — wir speichern keine IPs",
            "Newsletter, Termine, Musik und Trinkgeld als eigene Bausteine",
            "Ein Konto für Aeli und Aera",
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-signal" />
              {line}
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden">
            <BrandLink />
          </div>
          {children}
          <p className="mt-10 text-center text-xs text-ash">
            <Link href="/legal/datenschutz" className="underline-offset-4 hover:underline">
              Datenschutz
            </Link>
            <span className="mx-2">·</span>
            <Link href="/legal/agb" className="underline-offset-4 hover:underline">
              AGB
            </Link>
            <span className="mx-2">·</span>
            <Link href="/legal/impressum" className="underline-offset-4 hover:underline">
              Impressum
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
