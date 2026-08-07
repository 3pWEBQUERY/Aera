import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { BLOCK_CATALOG } from "@/lib/blocks";
import { THEME_PRESETS } from "@/lib/themes";
import { demoPage } from "@/lib/demo-page";
import { BrandLink, Wordmark } from "@/components/brand";
import { PhonePreview } from "@/components/studio/phone-preview";
import { HandleGrab } from "@/components/marketing/handle-grab";

export const metadata: Metadata = {
  // `absolute` statt eines Titels: die Vorlage im Root-Layout haengt sonst
  // „· Aeli" an einen Titel, der schon mit „Aeli" beginnt.
  title: { absolute: "Aeli — eine Seite, alle Links" },
  description:
    "Deine eigene Adresse unter deinname.aeli.so: Links, Musik, Termine, Newsletter und der Weg in deine Community. Statistik ohne Cookie-Banner.",
  alternates: { canonical: "/" },
};

/**
 * Die Startseite.
 *
 * Ein einziger Hero, ein einziger Aufruf zum Handeln. Was danach kommt, sind
 * vier konkrete Unterschiede zu einer Linkliste — keine Feature-Matrix, keine
 * Kundenlogos, keine Zahlen, die wir uns ausdenken müssten.
 *
 * Die Seite im Hero ist echt: dieselben Komponenten wie eine veröffentlichte
 * Aeli-Seite, nur mit erfundenem Inhalt.
 */
export default async function MarketingPage() {
  const user = await getCurrentUser();
  const suffix =
    env.AELI_ROOT_DOMAIN && env.AELI_ROOT_DOMAIN !== "localhost" ? env.AELI_ROOT_DOMAIN : "aeli.so";

  return (
    <div className="min-h-dvh">
      <a href="#inhalt" className="skip-link">
        Zum Inhalt
      </a>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandLink />
        <nav className="flex items-center gap-1 text-sm">
          {user ? (
            <Link
              href="/studio"
              className="rounded-xl bg-signal px-4 py-2.5 font-semibold text-ink transition-colors hover:bg-signal-deep"
            >
              Ins Studio
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-xl px-3.5 py-2.5 font-medium text-ash transition-colors hover:text-chalk"
              >
                Anmelden
              </Link>
              <Link
                href="/signup"
                className="rounded-xl bg-signal px-4 py-2.5 font-semibold text-ink transition-colors hover:bg-signal-deep"
              >
                Handle sichern
              </Link>
            </>
          )}
        </nav>
      </header>

      <main id="inhalt">
        {/* ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-64 left-1/2 size-[46rem] -translate-x-1/2 rounded-full bg-signal/10 blur-[130px]"
          />

          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-12 pb-24 lg:grid-cols-[1.05fr_auto] lg:pt-20">
            <div className="relative">
              <p className="text-sm font-medium text-signal">Link-in-Bio, aber ernst gemeint</p>

              <h1 className="mt-4 text-[clamp(2.6rem,7vw,4.4rem)] leading-[1.02] font-semibold tracking-tight text-balance">
                Eine Adresse.
                <br />
                <span className="text-ash">Alles, was du machst.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-pretty text-ash">
                Aeli gibt dir <span className="text-chalk">deinname.{suffix}</span> — eine Seite, die
                in zehn Minuten steht, auf jedem Handy sofort lädt und dir ehrlich sagt, worauf
                geklickt wird. Ohne Cookie-Banner, weil wir nichts sammeln, wofür man einen bräuchte.
              </p>

              <div className="mt-9">
                <HandleGrab suffix={suffix} />
              </div>

              <p className="mt-3 text-xs text-ash">
                Kostenlos, unbegrenzt viele Links. Kein Konto bei uns nötig, wenn du schon eins auf
                aera.so hast.
              </p>
            </div>

            {/* Die echte Seite, im Telefon. Auf schmalen Bildschirmen weg: dort
                ist der Platz für die Aussage und das Eingabefeld da. */}
            <div className="relative hidden justify-self-center lg:block">
              <PhonePreview page={demoPage()} width={320} />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <Section
          eyebrow="Der Unterschied"
          title="Vier Dinge, die eine Linkliste nicht kann"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Card
              title="Bausteine statt nur Links"
              body="Newsletter-Anmeldung, Kontaktformular, Musik mit Player, Termin-Buchung, QR-Code zum Abfotografieren. Alles auf der Seite selbst — nicht als Weiterleitung auf einen fremden Dienst."
            />
            <Card
              title="Zeitfenster pro Baustein"
              body="Der Vorverkauf erscheint Freitag um 18 Uhr und verschwindet, wenn er vorbei ist. Ohne dass jemand daran denken muss — und ohne dass am Montag noch ein toter Link dasteht."
            />
            <Card
              title="Statistik ohne Banner"
              body="Aufrufe, Klicks, Klickrate, Herkunft, Geräte. Keine IP-Adresse, kein Cookie, kein Fingerprint — der Besucherzähler arbeitet mit einem Hash, der jeden Tag ein anderer ist."
            />
            <Card
              title="Der Weg in deine Community"
              body="Wenn du auf aera.so eine Community hast, wird aus einem Klick eine Mitgliedschaft. Und wenn du live gehst, erscheint das oben auf deiner Seite — automatisch, nur solange es stimmt."
            />
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          eyebrow="Look"
          title="Acht Handschriften, nicht zweihundert Vorlagen"
          lead="Jedes Preset ist eine Entscheidung: Farbe, Schrift, Kantenradius und Hintergrundstimmung gehören zusammen. Danach kannst du nachjustieren — aber du fängst nie bei Weiß auf Weiß an."
        >
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {THEME_PRESETS.map((preset) => (
              <li key={preset.key} className="overflow-hidden rounded-2xl border border-line">
                <span
                  className="flex h-32 flex-col justify-end gap-2 p-4"
                  style={{ background: preset.bg }}
                >
                  <span
                    className="h-5 w-full"
                    style={{ background: preset.accent, borderRadius: radiusOf(preset.corner) }}
                  />
                  <span
                    className="h-5 w-3/4"
                    style={{
                      background: preset.surface,
                      border: `1px solid ${preset.border}`,
                      borderRadius: radiusOf(preset.corner),
                    }}
                  />
                </span>
                <span className="block px-4 py-3">
                  <span className="block text-sm font-medium text-chalk">{preset.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-ash">{preset.hint}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section eyebrow="Baukasten" title="Sechzehn Bausteine, alle im kostenlosen Konto">
          <ul className="flex flex-wrap gap-2">
            {BLOCK_CATALOG.map((entry) => (
              <li
                key={entry.type}
                className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-3.5 py-2.5 text-sm"
              >
                <span aria-hidden className="text-ash">
                  {entry.icon}
                </span>
                <span className="text-chalk">{entry.label}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="relative overflow-hidden rounded-3xl border border-line bg-ink-2 px-8 py-16 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-40 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-signal/12 blur-[110px]"
            />
            <h2 className="relative text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Welcher Handle gehört dir?
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-sm text-ash">
              Der gute ist meistens noch frei. Nur meistens.
            </p>
            <div className="relative mt-8 flex justify-center">
              <HandleGrab suffix={suffix} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-10 text-sm text-ash">
          <Wordmark className="text-base text-chalk" />
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/legal/impressum" className="hover:text-chalk">
              Impressum
            </Link>
            <Link href="/legal/datenschutz" className="hover:text-chalk">
              Datenschutz
            </Link>
            <Link href="/legal/agb" className="hover:text-chalk">
              AGB
            </Link>
            <a href={env.AERA_APP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-chalk">
              aera.so
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
      <header className="mb-9 max-w-2xl">
        <p className="text-sm font-medium text-signal">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{title}</h2>
        {lead && <p className="mt-3 text-sm leading-relaxed text-ash">{lead}</p>}
      </header>
      {children}
    </section>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-2xl border border-line bg-ink-2 p-6 transition-colors hover:border-ash/35">
      <h3 className="text-base font-semibold text-chalk">{title}</h3>
      <p className="mt-2.5 text-sm leading-relaxed text-ash">{body}</p>
    </article>
  );
}

function radiusOf(corner: string): string {
  return { sharp: "0px", soft: "6px", round: "10px", pill: "999px" }[corner] ?? "8px";
}
