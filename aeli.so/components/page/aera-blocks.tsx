import type { PageBlock, PageData } from "./types";
import type { PublicStrings } from "@/lib/public-strings";

/**
 * Die Bausteine, deren Inhalt aus der verknüpften Aera-Community kommt.
 *
 * Sie sind bewusst NICHT fünfmal dieselbe Liste mit anderem Titel. Fünf
 * gleich aussehende Abschnitte untereinander sind keine Seite, sondern ein
 * Bericht — und der Creator hat sie ja gerade deshalb einzeln hingestellt,
 * weil sie verschiedene Dinge sind:
 *
 *   Termine        Abrisskalender links, Titel rechts. Ein Datum liest man an
 *                  der Zahl, nicht am Fließtext.
 *   Mitgliedschaft Preis als größtes Element. Wer hier klickt, entscheidet
 *                  über Geld, nicht über einen Link.
 *   Shop           Zwei Spalten mit Bild. Produkte kauft man mit den Augen.
 *   Kurse          Breite Zeilen mit Beschreibung — ein Kurs braucht einen Satz.
 *   Räume          Chips. Ein Wegweiser ist kein Angebot.
 *
 * Alle fünf teilen eine Regel: ist die Liste leer, rendert der Baustein GAR
 * NICHTS. Eine Community ohne kommenden Termin ist kein Fehlerfall, und ein
 * „Keine Termine" auf einer Visitenkarte ist schlechter als eine Zeile weniger.
 */

/** Voreinstellung, wenn der Creator keine Zahl gesetzt hat. */
const DEFAULT_LIMIT = 3;

function limitOf(block: PageBlock): number {
  return block.config.limit ?? DEFAULT_LIMIT;
}

function money(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    // Ganze Beträge ohne „,00": auf einer Preiskachel zählt die Zahl, nicht
    // die Buchhaltung.
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/**
 * Die Überschrift über einer Liste.
 *
 * Kleiner und leiser als ein HEADER-Block: dieser Titel gehört zum Baustein,
 * nicht zur Gliederung der Seite. Er steht links, weil die Liste darunter auch
 * links beginnt — zentriert schwebte er über ihr statt vor ihr.
 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <h3 className="aeli-display mb-2 px-0.5 text-xs font-semibold tracking-[0.12em] uppercase opacity-55">
      {children}
    </h3>
  );
}

function Section({
  block,
  style,
  title,
  children,
}: {
  block: PageBlock;
  style: React.CSSProperties;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={style} className="aeli-rise">
      <SectionTitle>{block.title ?? title}</SectionTitle>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Termine
// ---------------------------------------------------------------------------

export function AeraEventsBlock({
  block,
  page,
  strings,
  style,
}: {
  block: PageBlock;
  page: PageData;
  strings: PublicStrings;
  style: React.CSSProperties;
}) {
  const events = page.aera.events.slice(0, limitOf(block));
  if (events.length === 0) return null;

  return (
    <Section block={block} style={style} title={strings.aeraEvents}>
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id}>
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              data-aeli-block={block.id}
              className="aeli-surface group flex items-center gap-3.5 p-3 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            >
              {/* Der Abrisskalender. Die Zahl trägt das Gewicht, der Monat
                  steht darüber wie auf dem Papier — und die Uhrzeit gehört
                  nach rechts zum Titel, nicht in die Kachel. */}
              <time
                dateTime={event.startsAt}
                title={event.dateLabel}
                className="flex size-11 shrink-0 flex-col items-center justify-center rounded-[calc(var(--aeli-radius)*0.5)] border border-[var(--aeli-border)] leading-none"
              >
                <span className="text-[0.6rem] font-medium tracking-wide uppercase opacity-60">
                  {event.monthLabel}
                </span>
                <span className="aeli-display mt-0.5 text-base font-semibold">
                  {event.dayLabel}
                </span>
              </time>

              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-semibold">{event.title}</span>
                <span className="mt-0.5 block truncate text-xs opacity-65">
                  {event.timeLabel}
                  {" · "}
                  {event.location ?? (event.isOnline ? strings.aeraEventOnline : event.dateLabel)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Mitgliedschaft
// ---------------------------------------------------------------------------

const INTERVAL_KEY = {
  FREE: "tierFree",
  MONTH: "tierMonth",
  YEAR: "tierYear",
  ONE_TIME: "tierOnce",
} as const;

export function AeraTiersBlock({
  block,
  page,
  strings,
  style,
}: {
  block: PageBlock;
  page: PageData;
  strings: PublicStrings;
  style: React.CSSProperties;
}) {
  const tiers = page.aera.tiers.slice(0, limitOf(block));
  if (tiers.length === 0) return null;

  return (
    <Section block={block} style={style} title={strings.aeraTiers}>
      <ul className="space-y-2">
        {tiers.map((tier) => (
          <li key={tier.id}>
            <a
              href={tier.url}
              target="_blank"
              rel="noopener noreferrer"
              data-aeli-block={block.id}
              className={`aeli-surface flex items-center gap-3 p-3.5 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${
                tier.isRecommended
                  ? "ring-2 ring-[color-mix(in_oklab,var(--aeli-accent)_55%,transparent)]"
                  : ""
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{tier.name}</span>
                  {tier.isRecommended && (
                    <span className="shrink-0 rounded-full bg-[var(--aeli-accent)] px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-[var(--aeli-accent-fg)] uppercase">
                      {strings.tierRecommended}
                    </span>
                  )}
                </span>
                {tier.description && (
                  <span className="mt-0.5 line-clamp-1 text-xs opacity-65">{tier.description}</span>
                )}
              </span>

              {/* Der Preis ist der Grund, warum dieser Baustein anders aussieht
                  als eine Liste von Links. Er steht rechts und trägt das
                  meiste Gewicht auf der Karte. */}
              <span className="shrink-0 text-right leading-tight">
                <span className="aeli-display block text-base font-semibold">
                  {tier.priceCents === 0
                    ? strings.tierFree
                    : money(tier.priceCents, tier.currency, strings.locale)}
                </span>
                {tier.priceCents > 0 && tier.interval !== "FREE" && (
                  <span className="block text-[0.65rem] opacity-60">
                    {strings[INTERVAL_KEY[tier.interval]]}
                  </span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export function AeraShopBlock({
  block,
  page,
  strings,
  style,
}: {
  block: PageBlock;
  page: PageData;
  strings: PublicStrings;
  style: React.CSSProperties;
}) {
  const products = page.aera.products.slice(0, limitOf(block));
  if (products.length === 0) return null;

  return (
    <Section block={block} style={style} title={strings.aeraShop}>
      <ul className="grid grid-cols-2 gap-2">
        {products.map((product) => (
          <li key={product.id}>
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              data-aeli-block={block.id}
              className="aeli-surface block h-full overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            >
              {product.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- fremder
                // Host, der Optimizer ist projektweit aus (next.config.ts).
                <img
                  src={product.coverUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              ) : (
                // Kein Kamerasymbol — das behauptet ein fehlendes Bild. Der
                // Anfangsbuchstabe in der Akzentfarbe behauptet nichts und
                // hält die Kacheln trotzdem gleich hoch; dieselbe Lösung wie
                // beim Community-Baustein ohne Logo.
                <span
                  aria-hidden
                  className="aeli-display flex aspect-square w-full items-center justify-center bg-[color-mix(in_oklab,var(--aeli-accent)_16%,transparent)] text-3xl font-semibold opacity-45"
                >
                  {product.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="block p-2.5">
                <span className="line-clamp-2 text-xs font-semibold leading-snug">
                  {product.name}
                </span>
                <span className="aeli-display mt-1 block text-sm font-semibold">
                  {money(product.priceCents, product.currency, strings.locale)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Kurse
// ---------------------------------------------------------------------------

export function AeraCoursesBlock({
  block,
  page,
  strings,
  style,
}: {
  block: PageBlock;
  page: PageData;
  strings: PublicStrings;
  style: React.CSSProperties;
}) {
  const courses = page.aera.courses.slice(0, limitOf(block));
  if (courses.length === 0) return null;

  return (
    <Section block={block} style={style} title={strings.aeraCourses}>
      <ul className="space-y-2">
        {courses.map((course) => (
          <li key={course.id}>
            <a
              href={course.url}
              target="_blank"
              rel="noopener noreferrer"
              data-aeli-block={block.id}
              className="aeli-surface flex gap-3 overflow-hidden pr-3.5 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            >
              {course.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={course.coverUrl}
                  alt=""
                  loading="lazy"
                  className="w-20 shrink-0 self-stretch object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="w-1.5 shrink-0 self-stretch bg-[var(--aeli-accent)]"
                />
              )}
              <span className="min-w-0 flex-1 py-3">
                <span className="line-clamp-1 text-sm font-semibold">{course.title}</span>
                {course.description && (
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-snug opacity-65">
                    {course.description}
                  </span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Räume
// ---------------------------------------------------------------------------

export function AeraSpacesBlock({
  block,
  page,
  strings,
  style,
}: {
  block: PageBlock;
  page: PageData;
  strings: PublicStrings;
  style: React.CSSProperties;
}) {
  const spaces = page.aera.spaces.slice(0, limitOf(block));
  if (spaces.length === 0) return null;

  return (
    <Section block={block} style={style} title={strings.aeraSpaces}>
      {/* Chips statt Karten: ein Wegweiser soll wenig Platz brauchen. Sechs
          Räume passen so in zwei Zeilen, als Karten wären es sechs. */}
      <ul className="flex flex-wrap gap-1.5">
        {spaces.map((space) => (
          <li key={space.id}>
            <a
              href={space.url}
              target="_blank"
              rel="noopener noreferrer"
              data-aeli-block={block.id}
              title={space.description ?? undefined}
              className="flex items-center gap-1.5 rounded-full border border-[var(--aeli-border)] bg-[var(--aeli-surface)] py-1.5 pr-3.5 pl-3 text-xs font-medium transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            >
              {space.icon && (
                <span aria-hidden className="text-sm leading-none">
                  {space.icon}
                </span>
              )}
              {space.name}
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
