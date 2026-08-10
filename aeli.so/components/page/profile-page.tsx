import { BlockView } from "./block-view";
import { Deck } from "./deck";
import { SocialIcon } from "@/components/social-icon";
import { themeStyleVars } from "@/lib/themes";
import type { PageCard, PageData, PageMode } from "./types";
import type { PublicStrings } from "@/lib/public-strings";

/**
 * Die Bio-Seite — ein Stapel Karten.
 *
 * Eine Karte ist eine ganze Seite: Avatar, Name, Bausteine, eigener
 * Hintergrund. Der Kopf steht auf jeder Karte, und das ist kein Versehen. Es
 * folgt daraus, was eine Karte ist: etwas Vollständiges, das man einzeln
 * teilen kann. Wer einen Tiefenlink auf „Shop" öffnet, soll nicht auf einem
 * Fragment landen, dem der Absender fehlt.
 *
 * Gewischt wird mit `scroll-snap`, nicht mit JavaScript. Der Stapel liegt
 * damit vollständig im HTML: er wird serverseitig gerendert, funktioniert ohne
 * JavaScript, und die Trägheit des Fingers macht der Browser richtig. Was
 * `components/page/deck.tsx` beisteuert, ist nur die Leiste darüber.
 *
 * Die Komponente ist rein: sie bekommt fertige Daten und rendert. Deshalb
 * funktioniert sie serverseitig auf `{handle}.aeli.so` genauso wie im Studio
 * als Live-Vorschau nicht gespeicherter Änderungen.
 */
export function ProfilePage({
  page,
  mode,
  strings,
  liveUrl,
}: {
  page: PageData;
  mode: PageMode;
  strings: PublicStrings;
  /** Für die Adresse beim Wischen. Null in der Vorschau. */
  liveUrl?: string | null;
}) {
  const scrollerId = `aeli-deck-${page.profileId}`;

  return (
    <div className="aeli-deck">
      <ul id={scrollerId} className="aeli-deck-scroller">
        {page.cards.map((card) => (
          <Card key={card.id} card={card} page={page} mode={mode} strings={strings} />
        ))}
      </ul>

      <Deck page={page} scrollerId={scrollerId} liveUrl={mode === "preview" ? null : (liveUrl ?? null)} />
    </div>
  );
}

function Card({
  card,
  page,
  mode,
  strings,
}: {
  card: PageCard;
  page: PageData;
  mode: PageMode;
  strings: PublicStrings;
}) {
  const theme = card.theme;
  const backdrop =
    theme.effectiveBackdrop === "none" ? "" : `aeli-backdrop aeli-backdrop-${theme.effectiveBackdrop}`;

  return (
    <li
      id={`karte-${card.slug}`}
      className={`aeli-deck-card ${backdrop}`}
      style={themeStyleVars(theme) as React.CSSProperties}
    >
      {/* Der eigene Hintergrund des Creators. Farbe und Verlauf kommen über
          `--aeli-bg-css`; ein Foto bekommt zusätzlich eigene Regler für
          Unschärfe und Abdunklung — und beides muss unter dem Text liegen,
          nicht auf ihm. Weil er zur Karte gehört, wandert er beim Wischen mit:
          man gleitet von einer Welt in die nächste. */}
      <div
        aria-hidden
        className="aeli-bg-layer"
        data-blurred={Boolean(theme.backgroundImage?.blur)}
        style={
          theme.backgroundImage
            ? {
                backgroundImage: `url(${JSON.stringify(theme.backgroundImage.url)})`,
                filter: theme.backgroundImage.blur
                  ? `blur(${theme.backgroundImage.blur}px)`
                  : undefined,
              }
            : undefined
        }
      />
      {theme.backgroundImage && theme.backgroundImage.dim > 0 && (
        <div aria-hidden className="aeli-bg-dim" style={{ opacity: theme.backgroundImage.dim }} />
      )}

      <div className="aeli-card-scroll">
        <div className="mx-auto flex min-h-full w-full max-w-[34rem] flex-col px-5 pt-10 pb-24 sm:pt-16">
        <header className="flex flex-col items-center text-center">
          {page.bannerUrl && (
            // Das Titelbild liegt hinter dem Avatar statt darüber: der Avatar
            // überlappt es, damit Kopfbereich und Name eine Form bilden.
            <div className="mb-[-2.75rem] w-full overflow-hidden rounded-[var(--aeli-radius)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.bannerUrl} alt="" className="aspect-[16/6] w-full object-cover" />
            </div>
          )}

          {page.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.avatarUrl}
              alt=""
              width={96}
              height={96}
              className="size-24 rounded-full border-4 border-[var(--aeli-bg)] object-cover shadow-lg"
            />
          ) : (
            <span
              aria-hidden
              className="aeli-display flex size-24 items-center justify-center rounded-full border-4 border-[var(--aeli-bg)] bg-[var(--aeli-accent)] text-3xl font-semibold text-[var(--aeli-accent-fg)]"
            >
              {page.displayName.charAt(0).toUpperCase()}
            </span>
          )}

          <h1 className="aeli-display mt-4 text-2xl font-semibold tracking-tight text-balance">
            {page.displayName}
          </h1>

          {page.isLive && page.community && (
            <a
              href={page.community.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-[var(--aeli-border)] bg-[var(--aeli-surface)] px-3 py-1 text-xs font-semibold"
            >
              <span aria-hidden className="aeli-live-dot size-1.5 rounded-full bg-[var(--aeli-accent)]" />
              {strings.liveNow}
            </a>
          )}

          {page.bio && (
            <p className="mt-3 max-w-[30rem] text-sm leading-relaxed text-pretty opacity-75">
              {page.bio}
            </p>
          )}

          {/* Die Social-Zeile steht im Kopf nur, wenn der Creator sie nicht
              selbst als Block gesetzt hat — sonst stünde sie zweimal da. */}
          {page.socials.length > 0 && !card.blocks.some((block) => block.type === "SOCIAL_ROW") && (
            <ul className="mt-4 flex flex-wrap justify-center gap-1">
              {page.socials.map((social) => (
                <li key={social.platform}>
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer me"
                    title={social.platform}
                    className="flex size-9 items-center justify-center p-2 opacity-70 transition-opacity hover:opacity-100"
                  >
                    <SocialIcon platform={social.platform} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </header>

        <main className="mt-8 flex flex-1 flex-col gap-3">
          {card.blocks.map((block, index) => (
            <BlockView
              key={block.id}
              block={block}
              page={page}
              theme={theme}
              mode={mode}
              strings={strings}
              index={index}
            />
          ))}

          {card.blocks.length === 0 && (
            <p className="py-10 text-center text-sm opacity-55">Hier entsteht gerade etwas.</p>
          )}
        </main>

        {page.showBranding && (
          <footer className="pt-10 text-center">
            <a
              href={mode === "preview" ? undefined : "https://aeli.so/?ref=page"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-baseline gap-1.5 rounded-full border border-[var(--aeli-border)] px-3.5 py-1.5 text-xs opacity-60 transition-opacity hover:opacity-100"
            >
              {strings.poweredBy}
              <span className="inline-flex items-baseline font-semibold">
                aeli
                <span
                  aria-hidden
                  className="ml-[0.09em] size-[0.3em] rounded-full bg-[var(--aeli-accent)]"
                />
              </span>
            </a>
          </footer>
        )}
        </div>
      </div>
    </li>
  );
}
