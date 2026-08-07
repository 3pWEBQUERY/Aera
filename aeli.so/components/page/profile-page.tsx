import { BlockView } from "./block-view";
import { SocialIcon } from "@/components/social-icon";
import { themeStyleVars } from "@/lib/themes";
import type { PageData, PageMode } from "./types";
import type { PublicStrings } from "@/lib/public-strings";

/**
 * Die Bio-Seite.
 *
 * Eine Komposition, keine Kartensammlung: Avatar und Name bilden ein Signal
 * oben, darunter steht eine einzige Spalte mit klaren Zielen. Kein Kasten um
 * jeden Block, keine Badges über den Ecken, kein zweites Menü — die Seite hat
 * genau eine Aufgabe, und alles, was von ihr ablenkt, fehlt hier absichtlich.
 *
 * Die Komponente ist rein: sie bekommt fertige Daten und rendert. Deshalb
 * funktioniert sie serverseitig auf `{handle}.aeli.so` genauso wie im Studio
 * als Live-Vorschau nicht gespeicherter Änderungen.
 */
export function ProfilePage({
  page,
  mode,
  strings,
}: {
  page: PageData;
  mode: PageMode;
  strings: PublicStrings;
}) {
  const backdrop =
    page.theme.effectiveBackdrop === "none"
      ? ""
      : `aeli-backdrop aeli-backdrop-${page.theme.effectiveBackdrop}`;

  return (
    <div
      className={`aeli-page ${backdrop}`}
      style={themeStyleVars(page.theme) as React.CSSProperties}
    >
      {/* Der eigene Hintergrund des Creators. Farbe und Verlauf kommen über
          `--aeli-bg-css`; ein Foto bekommt zusätzlich eigene Regler für
          Unschärfe und Abdunklung — und beides muss unter dem Text liegen,
          nicht auf ihm. */}
      <div
        aria-hidden
        className="aeli-bg-layer"
        data-blurred={Boolean(page.theme.backgroundImage?.blur)}
        style={
          page.theme.backgroundImage
            ? {
                backgroundImage: `url(${JSON.stringify(page.theme.backgroundImage.url)})`,
                filter: page.theme.backgroundImage.blur
                  ? `blur(${page.theme.backgroundImage.blur}px)`
                  : undefined,
              }
            : undefined
        }
      />
      {page.theme.backgroundImage && page.theme.backgroundImage.dim > 0 && (
        <div
          aria-hidden
          className="aeli-bg-dim"
          style={{ opacity: page.theme.backgroundImage.dim }}
        />
      )}

      <div className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col px-5 pt-10 pb-12 sm:pt-16">
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
          {page.socials.length > 0 && !page.blocks.some((block) => block.type === "SOCIAL_ROW") && (
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
          {page.blocks.map((block, index) => (
            <BlockView
              key={block.id}
              block={block}
              page={page}
              mode={mode}
              strings={strings}
              index={index}
            />
          ))}

          {page.blocks.length === 0 && (
            <p className="py-10 text-center text-sm opacity-55">
              Hier entsteht gerade etwas.
            </p>
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
  );
}
