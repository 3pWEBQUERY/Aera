import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/dashboard/icons";
import {
  isBlockEmpty,
  isExternalHref,
  type CtaBlock,
  type FaqBlock,
  type GalleryBlock,
  type ImageBlock,
  type LinksBlock,
  type PageBlock,
  type QuoteBlock,
  type StatsBlock,
  type TextBlock,
  type VideoBlock,
} from "@/lib/community-pages";

/**
 * Zeichnet die Inhaltsbausteine einer frei gebauten Seite.
 *
 * Serverkomponente ohne Zustand — auch das Aufklappen der Fragen laeuft ueber
 * <details>/<summary> statt ueber JavaScript. Eine "Ueber uns"-Seite soll
 * lesbar sein, bevor irgendein Skript geladen hat.
 *
 * Die Bausteine folgen dem Bild der Community-Seiten: Papierhintergrund,
 * Tinte #161613 in Abstufungen, Serifen-Display fuer Ueberschriften, Weiss auf
 * Papier fuer Karten. Die Markenfarbe bleibt Akzent und wird nie Flaeche —
 * ausser dort, wo der Creator sie ausdruecklich als Handlungsaufruf setzt.
 */

/** Externe Ziele oeffnen in einem neuen Tab, eigene bleiben im Fluss. */
function BlockLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (isExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** Ueberschrift eines Bausteins — nur gezeichnet, wenn der Creator eine setzt. */
function BlockTitle({ children }: { children: string }) {
  if (!children.trim()) return null;
  return <h2 className="display-serif mb-4 text-2xl text-[#161613]">{children}</h2>;
}

function TextPart({ block }: { block: TextBlock }) {
  return (
    <section>
      <BlockTitle>{block.title}</BlockTitle>
      <div
        className="rich-content max-w-3xl text-[15px] leading-7 text-[#161613]/80"
        // Der Inhalt hat beim Speichern den Allowlist-Filter durchlaufen
        // (sanitizeRichHtml in app/actions/community-pages.ts).
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
    </section>
  );
}

function ImagePart({ block }: { block: ImageBlock }) {
  // FULL tritt auf grossen Schirmen aus der Lesespalte heraus; auf kleinen
  // gibt es dafuer keinen Platz, dort ist es schlicht die volle Breite.
  const frame =
    block.width === "INSET" ? "mx-auto max-w-xl" : block.width === "FULL" ? "lg:-mx-16" : "";
  return (
    <figure className={frame}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.url}
        alt={block.alt}
        loading="lazy"
        className="w-full rounded-3xl border border-[#161613]/10 object-cover"
      />
      {block.caption.trim() && (
        <figcaption className="mt-3 text-center text-sm text-[#161613]/50">
          {block.caption}
        </figcaption>
      )}
    </figure>
  );
}

function GalleryPart({ block }: { block: GalleryBlock }) {
  return (
    <section>
      <BlockTitle>{block.title}</BlockTitle>
      {block.layout === "ROW" ? (
        <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {block.images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.id}
              src={img.url}
              alt={img.alt}
              loading="lazy"
              className="aspect-[4/5] w-[72%] shrink-0 snap-start rounded-2xl border border-[#161613]/10 object-cover sm:w-[38%] lg:w-[30%]"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {block.images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.id}
              src={img.url}
              alt={img.alt}
              loading="lazy"
              className="aspect-square w-full rounded-2xl border border-[#161613]/10 object-cover"
            />
          ))}
        </div>
      )}
    </section>
  );
}

function VideoPart({ block }: { block: VideoBlock }) {
  return (
    <section>
      <BlockTitle>{block.title}</BlockTitle>
      <video
        src={block.url}
        poster={block.posterUrl || undefined}
        controls
        preload="metadata"
        className="w-full rounded-3xl border border-[#161613]/10 bg-[#161613]"
      />
      {block.caption.trim() && (
        <p className="mt-3 text-center text-sm text-[#161613]/50">{block.caption}</p>
      )}
    </section>
  );
}

function QuotePart({ block }: { block: QuoteBlock }) {
  return (
    <figure className="border-l-2 border-[var(--brand)] pl-6 sm:pl-8">
      <blockquote className="display-serif text-2xl leading-[1.35] text-[#161613] sm:text-[28px]">
        {block.text}
      </blockquote>
      {(block.author.trim() || block.role.trim()) && (
        <figcaption className="mt-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/50">
          {block.author}
          {block.author.trim() && block.role.trim() && " · "}
          {block.role}
        </figcaption>
      )}
    </figure>
  );
}

function FaqPart({ block }: { block: FaqBlock }) {
  const items = block.items.filter((i) => i.question.trim() || i.answer.trim());
  return (
    <section>
      <BlockTitle>{block.title}</BlockTitle>
      <div className="divide-y divide-[#161613]/10 overflow-hidden rounded-2xl border border-[#161613]/10 bg-white">
        {items.map((item) => (
          <details key={item.id} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-semibold text-[#161613] transition-colors hover:bg-[#161613]/[0.03] [&::-webkit-details-marker]:hidden">
              {item.question}
              <Icon
                name="chevron"
                size={18}
                className="shrink-0 text-[#161613]/35 transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <div className="whitespace-pre-line px-5 pb-5 text-[15px] leading-7 text-[#161613]/70">
              {item.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function CtaPart({ block }: { block: CtaBlock }) {
  const solid = block.style === "SOLID";
  return (
    <section
      className={
        solid
          ? "rounded-3xl bg-[#161613] px-6 py-8 text-white sm:px-10 sm:py-10"
          : "rounded-3xl border border-[#161613]/15 bg-white px-6 py-8 sm:px-10 sm:py-10"
      }
    >
      <div className="mx-auto max-w-2xl text-center">
        {block.title.trim() && (
          <h2
            className={`display-serif text-2xl sm:text-3xl ${solid ? "text-white" : "text-[#161613]"}`}
          >
            {block.title}
          </h2>
        )}
        {block.text.trim() && (
          <p
            className={`mt-3 text-[15px] leading-7 ${solid ? "text-white/70" : "text-[#161613]/65"}`}
          >
            {block.text}
          </p>
        )}
        {block.label.trim() && block.href && (
          <BlockLink
            href={block.href}
            className={`mt-6 inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-semibold transition ${
              solid
                ? "bg-white text-[#161613] hover:bg-white/90"
                : "bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]"
            }`}
          >
            {block.label}
          </BlockLink>
        )}
      </div>
    </section>
  );
}

function LinksPart({ block }: { block: LinksBlock }) {
  const items = block.items.filter((i) => i.label.trim() && i.href);
  return (
    <section>
      <BlockTitle>{block.title}</BlockTitle>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <BlockLink
              href={item.href}
              className="group flex items-center justify-between gap-4 rounded-2xl border border-[#161613]/10 bg-white px-5 py-4 transition-colors hover:border-[#161613]/25"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-[#161613]">
                  {item.label}
                </span>
                {item.description.trim() && (
                  <span className="mt-0.5 block truncate text-sm text-[#161613]/55">
                    {item.description}
                  </span>
                )}
              </span>
              <Icon
                name="arrowRight"
                size={18}
                className="shrink-0 text-[#161613]/25 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#161613]/60"
              />
            </BlockLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatsPart({ block }: { block: StatsBlock }) {
  const items = block.items.filter((i) => i.value.trim() || i.label.trim());
  return (
    <section>
      <BlockTitle>{block.title}</BlockTitle>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#161613]/10 bg-[#161613]/10 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="bg-white px-5 py-6 text-center">
            <dt className="sr-only">{item.label}</dt>
            <dd>
              <span className="display-serif block text-3xl text-[#161613]">{item.value}</span>
              <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/50">
                {item.label}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DividerPart({ style }: { style: "LINE" | "SPACE" | "DOTS" }) {
  if (style === "SPACE") return <div aria-hidden className="h-6" />;
  if (style === "DOTS") {
    return (
      <div aria-hidden className="flex justify-center gap-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#161613]/20" />
        ))}
      </div>
    );
  }
  return <hr className="border-0 border-t border-[#161613]/10" />;
}

function Block({ block }: { block: PageBlock }) {
  switch (block.type) {
    case "TEXT":
      return <TextPart block={block} />;
    case "IMAGE":
      return <ImagePart block={block} />;
    case "GALLERY":
      return <GalleryPart block={block} />;
    case "VIDEO":
      return <VideoPart block={block} />;
    case "QUOTE":
      return <QuotePart block={block} />;
    case "FAQ":
      return <FaqPart block={block} />;
    case "CTA":
      return <CtaPart block={block} />;
    case "LINKS":
      return <LinksPart block={block} />;
    case "STATS":
      return <StatsPart block={block} />;
    case "DIVIDER":
      return <DividerPart style={block.style} />;
  }
}

export async function CommunityPageBlocks({ blocks }: { blocks: PageBlock[] }) {
  // Leere Bausteine ueberspringen: ein angefangener, nie ausgefuellter
  // Baustein soll auf der Seite kein Loch hinterlassen.
  const filled = blocks.filter((b) => !isBlockEmpty(b));
  if (filled.length === 0) {
    const t = await getTranslations("community.pages");
    return <p className="py-10 text-center text-sm text-[#161613]/45">{t("emptyPage")}</p>;
  }
  return (
    <div className="space-y-12">
      {filled.map((block) => (
        <Block key={block.id} block={block} />
      ))}
    </div>
  );
}
