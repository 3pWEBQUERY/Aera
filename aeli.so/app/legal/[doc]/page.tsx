import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { BrandLink } from "@/components/brand";

/**
 * Impressum, Datenschutz, AGB und Widerruf.
 *
 * Aeli und Aera werden vom selben Anbieter betrieben und unterliegen denselben
 * Dokumenten — die Zustimmung bei der Registrierung wird deshalb auch gegen
 * dieselben Versionsnummern protokolliert (siehe lib/auth.ts).
 *
 * Diese Seiten führen deshalb bewusst auf die Originale statt eigene Fassungen
 * zu tragen: zwei Kopien desselben Rechtstexts laufen zwangsläufig
 * auseinander, und die falsche wäre dann die, die jemand gelesen hat. Der
 * Verweis steht als eigene, dauerhaft erreichbare Seite hier — nicht als
 * Weiterleitung, die im Verlauf verschwindet.
 */

const DOCS = {
  impressum: {
    title: "Impressum",
    path: "/impressum",
    lead: "Anbieterkennzeichnung nach § 5 DDG.",
  },
  datenschutz: {
    title: "Datenschutz",
    path: "/datenschutz",
    lead: "Welche Daten wir verarbeiten — und welche wir bewusst nicht erheben.",
  },
  agb: {
    title: "AGB",
    path: "/agb",
    lead: "Die Bedingungen, denen du bei der Registrierung zugestimmt hast.",
  },
  widerruf: {
    title: "Widerruf",
    path: "/widerruf",
    lead: "Widerrufsbelehrung für kostenpflichtige Leistungen.",
  },
} as const;

type DocKey = keyof typeof DOCS;

export function generateStaticParams(): { doc: DocKey }[] {
  return (Object.keys(DOCS) as DocKey[]).map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  const entry = DOCS[doc as DocKey];
  return entry ? { title: entry.title, description: entry.lead } : { title: "Nicht gefunden" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const entry = DOCS[doc as DocKey];
  if (!entry) notFound();

  const href = `${env.AERA_APP_URL}${entry.path}`;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <BrandLink />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">{entry.title}</h1>
        <p className="mt-3 text-sm text-ash">{entry.lead}</p>

        <div className="mt-8 rounded-2xl border border-line bg-ink-2 p-6">
          <p className="text-sm leading-relaxed text-ash">
            Aeli wird vom selben Anbieter betrieben wie Aera. Es gilt daher dasselbe{" "}
            <span className="text-chalk">{entry.title}</span> — in der Fassung, die unter aera.so
            veröffentlicht ist. Wir führen hier bewusst keine zweite Kopie: zwei Fassungen desselben
            Textes laufen mit der Zeit auseinander, und dann wäre unklar, welche gilt.
          </p>

          <a
            href={href}
            className="mt-6 inline-flex h-11 items-center rounded-xl bg-signal px-5 text-sm font-semibold text-ink transition-colors hover:bg-signal-deep"
          >
            {entry.title} auf aera.so öffnen
          </a>
        </div>

        <p className="mt-8 text-sm text-ash">
          <Link href="/" className="underline underline-offset-4 hover:text-chalk">
            Zurück zur Startseite
          </Link>
        </p>
      </main>
    </div>
  );
}
