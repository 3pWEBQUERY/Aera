import { resolveEmbed } from "@/lib/embed";
import { SocialIcon } from "@/components/social-icon";
import { LeadForm } from "./lead-form";
import { ShareBlock } from "./share-block";
import { TipForm } from "./tip-form";
import {
  AeraCoursesBlock,
  AeraEventsBlock,
  AeraShopBlock,
  AeraSpacesBlock,
  AeraTiersBlock,
} from "./aera-blocks";
import type { PageBlock, PageData, PageMode } from "./types";
import type { PublicStrings } from "@/lib/public-strings";

/**
 * Ein Block, gerendert.
 *
 * Alles hier ist serverfähig; nur die beiden Bausteine mit echter Interaktion
 * (Formular, Teilen) sind Client-Komponenten. Die Links selbst bleiben `<a>`,
 * damit sie ohne JavaScript funktionieren und die Zählung sie trotzdem
 * mitbekommt (siehe tracker.tsx).
 */

const BUTTON_CLASS: Record<string, string> = {
  solid: "aeli-btn-solid",
  outline: "aeli-btn-outline",
  soft: "aeli-btn-soft",
  glass: "aeli-btn-glass",
};

function buttonClass(page: PageData): string {
  return BUTTON_CLASS[page.theme.effectiveButtonStyle] ?? "aeli-btn-solid";
}

/**
 * Der Pfeil rechts an jedem Link. Er sagt „führt weg von hier“ und ist der
 * einzige Ort, an dem sich beim Überfahren etwas bewegt.
 */
function Arrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="ml-auto size-4 shrink-0 opacity-45 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:opacity-80 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
    >
      <path
        d="M3 8h9M8.5 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Thumbnail({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Creator-Bilder liegen
    // auf fremden Hosts; der Optimizer ist hier deaktiviert (next.config.ts).
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="size-10 shrink-0 rounded-[calc(var(--aeli-radius)*0.55)] object-cover"
    />
  );
}

export function BlockView({
  block,
  page,
  mode,
  strings,
  index,
}: {
  block: PageBlock;
  page: PageData;
  mode: PageMode;
  strings: PublicStrings;
  index: number;
}) {
  const style = { "--i": index } as React.CSSProperties;
  const config = block.config;

  switch (block.type) {
    case "HEADER":
      return (
        <h2
          style={style}
          className="aeli-rise aeli-display mt-6 mb-1 text-center text-sm font-semibold tracking-[0.14em] uppercase opacity-65 first:mt-0"
        >
          {block.title}
        </h2>
      );

    case "TEXT":
      return (
        <p style={style} className="aeli-rise px-1 text-center text-sm leading-relaxed opacity-80">
          {block.title}
        </p>
      );

    case "DIVIDER":
      // Andeuten, nicht trennen: die Rahmenfarbe des Themes auf halber
      // Deckkraft. Eine volle Linie zerschneidet die Seite in zwei Seiten.
      return (
        <hr
          style={style}
          aria-hidden
          className="aeli-rise my-3 h-px border-0 bg-[var(--aeli-border)] opacity-60"
        />
      );

    case "SOCIAL_ROW":
      if (page.socials.length === 0) return null;
      return (
        <ul style={style} className="aeli-rise flex flex-wrap justify-center gap-2.5 py-1">
          {page.socials.map((social) => (
            <li key={social.platform}>
              <a
                href={social.url}
                target="_blank"
                rel="noopener noreferrer me"
                data-aeli-block={block.id}
                title={social.platform}
                className="flex size-11 items-center justify-center rounded-full border border-[var(--aeli-border)] bg-[var(--aeli-surface)] p-2.5 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
              >
                <SocialIcon platform={social.platform} />
              </a>
            </li>
          ))}
        </ul>
      );

    case "IMAGE": {
      if (!block.mediaUrl) return null;
      const image = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.mediaUrl}
          alt={config.alt ?? block.title ?? ""}
          loading="lazy"
          className="w-full rounded-[var(--aeli-radius)] object-cover"
        />
      );
      return (
        <figure style={style} className="aeli-rise">
          {block.href ? (
            <a href={block.href} target="_blank" rel="noopener noreferrer" data-aeli-block={block.id}>
              {image}
            </a>
          ) : (
            image
          )}
          {block.title && (
            <figcaption className="mt-2 text-center text-xs opacity-65">{block.title}</figcaption>
          )}
        </figure>
      );
    }

    case "EMBED":
    case "MUSIC": {
      const embed = resolveEmbed(config.embedUrl ?? block.href ?? "");
      if (!embed) {
        // Lieber ein ehrlicher Link als ein leerer Rahmen: wenn der Anbieter
        // nicht auf der Allowlist steht, bleibt das Ziel trotzdem erreichbar.
        return block.href ? (
          <LinkBlock block={block} page={page} style={style} href={block.href} />
        ) : null;
      }
      return (
        <div
          style={style}
          className="aeli-rise overflow-hidden rounded-[var(--aeli-radius)] border border-[var(--aeli-border)] bg-[var(--aeli-surface)]"
        >
          <iframe
            src={embed.src}
            title={block.title ?? embed.label}
            loading="lazy"
            allow={embed.allow}
            referrerPolicy="strict-origin-when-cross-origin"
            className="block w-full border-0"
            style={
              embed.fixedHeight
                ? { height: embed.fixedHeight }
                : { aspectRatio: embed.aspect, height: "auto" }
            }
          />
        </div>
      );
    }

    case "NEWSLETTER":
    case "CONTACT":
      return (
        <section style={style} className="aeli-rise aeli-surface space-y-3 p-4">
          {block.title && <h3 className="aeli-display text-base font-semibold">{block.title}</h3>}
          {block.subtitle && <p className="-mt-1.5 text-xs opacity-70">{block.subtitle}</p>}
          <LeadForm
            profileId={page.profileId}
            blockId={block.id}
            source={block.type === "NEWSLETTER" ? "NEWSLETTER" : "CONTACT"}
            mode={mode}
            withMessage={block.type === "CONTACT" ? config.withMessage !== false : false}
            buttonLabel={
              config.buttonLabel ??
              (block.type === "NEWSLETTER" ? strings.newsletterButton : strings.contactButton)
            }
            successMessage={
              config.successMessage ??
              (block.type === "NEWSLETTER" ? strings.newsletterDone : strings.contactDone)
            }
            strings={strings}
          />
        </section>
      );

    case "QR_SHARE":
      return (
        <ShareBlock
          style={style}
          title={block.title ?? strings.shareTitle}
          url={page.publicUrl}
          handle={page.handle}
          copyLabel={strings.shareCopy}
          copiedLabel={strings.shareCopied}
          mode={mode}
        />
      );

    case "LIVE_NOW": {
      // Der Block ist die Ausnahme von „was der Creator anlegt, steht da“: er
      // erscheint nur, solange wirklich gesendet wird. Ein „Jetzt live“, das
      // immer dasteht, ist schlimmer als keins.
      if (!page.isLive || !page.community) return null;
      return (
        <a
          href={page.community.url}
          target="_blank"
          rel="noopener noreferrer"
          data-aeli-block={block.id}
          style={style}
          className={`aeli-rise aeli-link group ${buttonClass(page)}`}
        >
          <span
            aria-hidden
            className="aeli-live-dot size-2.5 shrink-0 rounded-full bg-current"
          />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{block.title ?? strings.liveNow}</span>
            <span className="block truncate text-xs opacity-70">{page.community.name}</span>
          </span>
          <Arrow />
        </a>
      );
    }

    case "COMMUNITY_CTA": {
      if (!page.community) return null;
      return (
        <a
          href={page.community.url}
          target="_blank"
          rel="noopener noreferrer"
          data-aeli-block={block.id}
          style={style}
          className="aeli-rise aeli-link group aeli-surface"
        >
          {page.community.logoUrl ? (
            <Thumbnail src={page.community.logoUrl} alt="" />
          ) : (
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-[calc(var(--aeli-radius)*0.55)] bg-[var(--aeli-accent)] text-[var(--aeli-accent-fg)] font-semibold"
            >
              {page.community.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-semibold">
              {block.title ?? strings.joinCommunity}
            </span>
            <span className="block truncate text-xs opacity-70">
              {block.subtitle ?? page.community.tagline ?? page.community.name}
            </span>
          </span>
          <Arrow />
        </a>
      );
    }

    // Die fünf Aera-Bausteine liegen in einer eigenen Datei: sie bringen je
    // eine eigene Bauform mit, und fünf davon hier hätten diese Funktion
    // verdoppelt. Was sie eint, steht dort im Kopfkommentar.
    case "AERA_EVENTS":
      return <AeraEventsBlock block={block} page={page} strings={strings} style={style} />;
    case "AERA_TIERS":
      return <AeraTiersBlock block={block} page={page} strings={strings} style={style} />;
    case "AERA_SHOP":
      return <AeraShopBlock block={block} page={page} strings={strings} style={style} />;
    case "AERA_COURSES":
      return <AeraCoursesBlock block={block} page={page} strings={strings} style={style} />;
    case "AERA_SPACES":
      return <AeraSpacesBlock block={block} page={page} strings={strings} style={style} />;

    case "PRODUCT":
      if (!block.href) return null;
      return (
        <a
          href={block.href}
          target="_blank"
          rel="noopener noreferrer"
          data-aeli-block={block.id}
          style={style}
          className="aeli-rise aeli-surface group block overflow-hidden"
        >
          {block.mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.mediaUrl}
              alt=""
              loading="lazy"
              className="aspect-[16/10] w-full object-cover"
            />
          )}
          <span className="flex items-center gap-3 p-4">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{block.title}</span>
              {block.subtitle && (
                <span className="block truncate text-xs opacity-70">{block.subtitle}</span>
              )}
            </span>
            {typeof config.priceCents === "number" && (
              <span className="shrink-0 rounded-full bg-[var(--aeli-accent)] px-3 py-1 text-xs font-semibold text-[var(--aeli-accent-fg)]">
                {formatPrice(config.priceCents, config.currency ?? "EUR")}
              </span>
            )}
          </span>
        </a>
      );

    case "TIP":
      // Mit verbundenem Auszahlungskonto ist das ein Bezahlvorgang, ohne bleibt
      // es der Link auf eine fremde Spendenseite, der es vorher war. Die
      // Entscheidung faellt an `tipsEnabled` und damit an der Datenbank — nicht
      // daran, ob der Creator ein Feld ausgefuellt hat.
      if (page.tipsEnabled) {
        return <TipForm block={block} page={page} mode={mode} style={style} />;
      }
      if (!block.href) return null;
      return <LinkBlock block={block} page={page} style={style} href={block.href} />;

    case "BOOKING":
    case "LINK":
    default:
      if (!block.href) return null;
      return <LinkBlock block={block} page={page} style={style} href={block.href} />;
  }
}

function LinkBlock({
  block,
  page,
  style,
  href,
}: {
  block: PageBlock;
  page: PageData;
  style: React.CSSProperties;
  href: string;
}) {
  const config = block.config;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-aeli-block={block.id}
      style={style}
      className={`aeli-rise aeli-link group ${buttonClass(page)} ${
        config.highlight
          ? "ring-2 ring-[color-mix(in_oklab,var(--aeli-accent)_60%,transparent)] ring-offset-2 ring-offset-[var(--aeli-bg)]"
          : ""
      }`}
    >
      {config.thumbnailUrl ? (
        <Thumbnail src={config.thumbnailUrl} alt="" />
      ) : block.icon ? (
        <span aria-hidden className="w-6 shrink-0 text-center text-lg leading-none">
          {block.icon}
        </span>
      ) : null}

      <span className="min-w-0">
        {/* Zwei Zeilen statt Abschneiden: „Workshop: Available Light" ist ein
            vollständiger Titel, kein zu langer. Auf 390 px Handybreite passt
            er neben Etikett und Pfeil nicht in eine Zeile — abgeschnitten
            („Workshop: Availab…") wäre er aber unbrauchbar. */}
        <span className="line-clamp-2">{block.title}</span>
        {block.subtitle && (
          <span className="block truncate text-xs font-normal opacity-70">{block.subtitle}</span>
        )}
      </span>

      {config.badge && (
        <span className="shrink-0 rounded-full border border-current/30 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase opacity-75">
          {config.badge}
        </span>
      )}
      <Arrow />
    </a>
  );
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}
