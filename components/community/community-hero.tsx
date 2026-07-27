import { HeroActions } from "./hero-actions";
import { SOCIAL_BY_KEY, SocialGlyph } from "@/components/dashboard/social-icons";
import type { HeaderVariant, SocialLink } from "@/lib/layout";

/**
 * Kopfzeile der Community-Startseite in fuenf Ausfuehrungen.
 *
 * Der Creator waehlt sie im Seiten-Editor unter "Kopfzeilendetails"; jede
 * Ausfuehrung zeigt dieselben Inhalte — Titelbild, Logo, Name, Beschreibung,
 * Zahlen, Preis, Aktionen, Social-Links — nur anders angeordnet. Bewusst kein
 * Baukasten mit einzeln schaltbaren Teilen: fuenf durchgestaltete Zustaende
 * sind leichter zu waehlen und koennen nicht kaputt konfiguriert werden.
 *
 * Fehlt ein Inhalt, faellt jede Ausfuehrung sauber zurueck (kein Titelbild →
 * Markenflaeche mit Initiale, keine Beitragsbilder → Titelbild, kein Preis →
 * Zeile ohne Preis). Nichts davon hinterlaesst ein Loch im Layout.
 */

export interface CommunityHeroData {
  slug: string;
  name: string;
  /** Kurzbeschreibung — Tagline, sonst der "Ueber"-Text. */
  tagline: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string;
  memberCount: number;
  postCount: number;
  /** Fertig formatiert, z. B. "4,99 €/Monat" — guenstigste bezahlte Stufe. */
  priceLabel: string | null;
  /** Bilder freigegebener Beitraege fuer das Mosaik. */
  mosaic: string[];
  socials: SocialLink[];
  isMember: boolean;
  isStaff: boolean;
  tipsHref: string | null;
  labels: { posts: string; members: string };
}

const DOT = (
  <span className="mx-1.5" aria-hidden>
    ·
  </span>
);

/** Markenflaeche mit grosser Initiale — der Platzhalter fuer jedes Bild. */
function BrandPlate({
  name,
  color,
  className = "",
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ backgroundColor: color }}
    >
      <span
        aria-hidden
        className="display-serif select-none text-[clamp(72px,16vw,200px)] leading-none text-white/25"
      >
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

/**
 * Logo mit Trennring. Der Ring nimmt die Farbe der Flaeche auf, auf der das
 * Logo liegt — "paper" fuer den Seitenhintergrund, "white" ueber einem Bild,
 * "none" wenn nichts zu trennen ist. Ein weisser Ring auf dem warmen Papier
 * der Community-Seite sieht sonst aus wie ein vergessener Heiligenschein.
 */
function Logo({
  url,
  name,
  color,
  size,
  ring = "none",
}: {
  url: string | null;
  name: string;
  color: string;
  size: number;
  ring?: "paper" | "white" | "none";
}) {
  const ringCls =
    ring === "paper" ? "ring-4 ring-[#f4f1ea]" : ring === "white" ? "ring-4 ring-white" : "";
  const cls = `rounded-2xl object-cover shadow-sm ${ringCls}`;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cls} style={{ width: size, height: size }} />;
  }
  return (
    <span
      className={`${cls} flex items-center justify-center font-bold text-white`}
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.42 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Zahlenzeile: Beitraege · Mitglieder · Preis. */
function Stats({ d, tone = "ink" }: { d: CommunityHeroData; tone?: "ink" | "light" }) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-[0.15em] ${
        tone === "light" ? "text-white/70" : "text-[#161613]/50"
      }`}
    >
      {d.labels.posts}
      {DOT}
      {d.labels.members}
      {d.priceLabel && (
        <>
          {DOT}
          {d.priceLabel}
        </>
      )}
    </p>
  );
}

function Socials({ d, tone = "ink" }: { d: CommunityHeroData; tone?: "ink" | "light" }) {
  if (d.socials.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {d.socials.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={SOCIAL_BY_KEY[s.platform]?.label ?? "Link"}
          title={SOCIAL_BY_KEY[s.platform]?.label ?? "Link"}
          className={`block overflow-hidden rounded-[11px] ring-1 transition focus-visible:outline-none focus-visible:ring-2 ${
            tone === "light"
              ? "ring-white/25 hover:ring-white/60 focus-visible:ring-white"
              : "ring-[#161613]/10 hover:ring-[#161613]/35 focus-visible:ring-[#161613]/40"
          }`}
        >
          <SocialGlyph platform={s.platform} size={40} />
        </a>
      ))}
    </div>
  );
}

export function CommunityHero({
  variant,
  data,
}: {
  variant: HeaderVariant;
  data: CommunityHeroData;
}) {
  switch (variant) {
    case "MOSAIC":
      return <Mosaic d={data} />;
    case "SPOTLIGHT":
      return <Spotlight d={data} />;
    case "IMMERSIVE":
      return <Immersive d={data} />;
    case "COMPACT":
      return <Compact d={data} />;
    default:
      return <Editorial d={data} />;
  }
}

// ------------------------------------------------------------- Editorial
/** Gerahmtes Titelbild, Text darunter auf der Seite. Der bisherige Aufbau. */
function Editorial({ d }: { d: CommunityHeroData }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="relative aspect-[5/2] w-full overflow-hidden rounded-3xl sm:aspect-[3/1]">
        {d.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <BrandPlate name={d.name} color={d.primaryColor} className="absolute inset-0" />
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pb-2 pt-6 sm:pt-8">
        <div className="min-w-0 max-w-2xl">
          <Stats d={d} />
          <h1 className="display-serif mt-2 text-4xl leading-[1.05] text-[#161613] sm:text-6xl">
            {d.name}
          </h1>
          {d.tagline && (
            <p className="mt-3 line-clamp-2 max-w-xl text-base leading-7 text-[#161613]/65">
              {d.tagline}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <HeroActions slug={d.slug} isMember={d.isMember} isStaff={d.isStaff} tipsHref={d.tipsHref} />
          <Socials d={d} />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Mosaic
/**
 * Raster aus den Bildern freigegebener Beitraege, darunter mittig Logo, Name,
 * Zahlen und Aktionen. Die Kopfzeile zeigt damit, was es in der Community
 * tatsaechlich zu sehen gibt, statt ein einzelnes Werbebild.
 */
function Mosaic({ d }: { d: CommunityHeroData }) {
  const tiles = d.mosaic.slice(0, 12);
  return (
    <section>
      <div className="relative h-[180px] w-full overflow-hidden bg-[#161613]/5 sm:h-[260px]">
        {tiles.length >= 4 ? (
          <div className="grid h-full w-full grid-cols-4 grid-rows-2 gap-0.5 sm:grid-cols-6">
            {tiles.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className="h-full w-full object-cover" />
            ))}
          </div>
        ) : d.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <BrandPlate name={d.name} color={d.primaryColor} className="absolute inset-0" />
        )}
      </div>

      {/* `relative` ist hier Pflicht: der Bildstreifen darueber ist ebenfalls
          positioniert und wuerde das ueberlappende Logo sonst verdecken. */}
      <div className="relative mx-auto max-w-3xl px-4 pb-2 text-center sm:px-6">
        <div className="-mt-11 mb-3 flex justify-center">
          <Logo url={d.logoUrl} name={d.name} color={d.primaryColor} size={84} ring="paper" />
        </div>
        <h1 className="display-serif text-3xl leading-tight text-[#161613] sm:text-5xl">{d.name}</h1>
        <div className="mt-2.5 flex justify-center">
          <Stats d={d} />
        </div>
        {d.tagline && (
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#161613]/65">{d.tagline}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
          <HeroActions slug={d.slug} isMember={d.isMember} isStaff={d.isStaff} tipsHref={d.tipsHref} />
        </div>
        {d.socials.length > 0 && (
          <div className="mt-5 flex justify-center">
            <Socials d={d} />
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------- Spotlight
/**
 * Farbflaeche aus der Primaerfarbe, links der Text, rechts das Bild als
 * gerundete Karte. Die Flaeche wird immer ins Dunkle gemischt, damit weisse
 * Schrift auch auf einem hellen Gelb lesbar bleibt.
 */
function Spotlight({ d }: { d: CommunityHeroData }) {
  const portrait = d.coverUrl ?? d.logoUrl;
  return (
    <section
      className="w-full"
      style={{
        backgroundImage:
          "linear-gradient(150deg," +
          " color-mix(in oklab, var(--brand) 78%, #050408) 0%," +
          " color-mix(in oklab, var(--brand) 34%, #0b0810) 100%)",
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-col-reverse items-center gap-8 px-4 py-10 sm:px-6 md:flex-row md:justify-between md:py-14">
        <div className="min-w-0 max-w-2xl">
          <h1 className="display-serif text-4xl leading-[1.05] text-white sm:text-6xl">{d.name}</h1>
          <div className="mt-3">
            <Stats d={d} tone="light" />
          </div>
          {d.tagline && (
            <p className="mt-4 line-clamp-3 max-w-xl text-base leading-7 text-white/75">
              {d.tagline}
            </p>
          )}
          <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-3">
            <HeroActions
              slug={d.slug}
              isMember={d.isMember}
              isStaff={d.isStaff}
              tipsHref={d.tipsHref}
              tone="light"
            />
            <Socials d={d} tone="light" />
          </div>
        </div>

        <div className="w-full max-w-[260px] shrink-0 md:max-w-[300px]">
          <div className="relative aspect-square w-full overflow-hidden rounded-3xl ring-1 ring-white/20">
            {portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portrait} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <BrandPlate name={d.name} color={d.primaryColor} className="absolute inset-0" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------- Immersive
/** Titelbild ueber die volle Breite, Text darauf. Fuer starke Titelbilder. */
function Immersive({ d }: { d: CommunityHeroData }) {
  return (
    <section className="relative w-full">
      <div className="relative h-[300px] w-full overflow-hidden sm:h-[420px]">
        {d.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <BrandPlate name={d.name} color={d.primaryColor} className="absolute inset-0" />
        )}
        {/* Der Schleier muss bis ueber die Ueberschrift reichen. Ein heller
            Himmel im Titelbild frisst weisse Schrift sonst auf — getestet mit
            einem lila Verlauf, bei dem der Name fast verschwand. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top," +
              " rgb(8 6 10 / 0.92) 0%," +
              " rgb(8 6 10 / 0.80) 34%," +
              " rgb(8 6 10 / 0.45) 62%," +
              " rgb(8 6 10 / 0) 92%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-x-10 gap-y-5 px-4 pb-7 sm:px-6 sm:pb-9">
            <div className="min-w-0 max-w-2xl">
              <div className="mb-3">
                <Logo url={d.logoUrl} name={d.name} color={d.primaryColor} size={56} ring="white" />
              </div>
              <h1 className="display-serif text-4xl leading-[1.05] text-white sm:text-6xl">
                {d.name}
              </h1>
              <div className="mt-2.5">
                <Stats d={d} tone="light" />
              </div>
              {d.tagline && (
                <p className="mt-3 line-clamp-2 max-w-xl text-base leading-7 text-white/75">
                  {d.tagline}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
              <HeroActions
                slug={d.slug}
                isMember={d.isMember}
                isStaff={d.isStaff}
                tipsHref={d.tipsHref}
                tone="light"
              />
              <Socials d={d} tone="light" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------- Compact
/**
 * Nur eine schmale Zeile. Fuer Communities, in denen der Inhalt zaehlt und
 * nicht das Titelbild — der erste Beitrag steht sofort im Blick.
 */
function Compact({ d }: { d: CommunityHeroData }) {
  return (
    <section className="border-b border-[#161613]/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 py-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Logo url={d.logoUrl} name={d.name} color={d.primaryColor} size={52} />
          <div className="min-w-0">
            <h1 className="display-serif truncate text-2xl leading-tight text-[#161613] sm:text-3xl">
              {d.name}
            </h1>
            <div className="mt-1">
              <Stats d={d} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <HeroActions slug={d.slug} isMember={d.isMember} isStaff={d.isStaff} tipsHref={d.tipsHref} />
          <Socials d={d} />
        </div>
      </div>
    </section>
  );
}
