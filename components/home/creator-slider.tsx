"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

export interface SliderCreator {
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string;
  accentColor: string;
}

function CreatorTile({ c }: { c: SliderCreator }) {
  const image = c.logoUrl ?? c.coverUrl;
  return (
    <Link
      href={`/c/${c.slug}`}
      className="group w-[180px] shrink-0 snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] sm:w-[200px]"
    >
      <div className="aspect-square w-full overflow-hidden rounded-2xl border border-[#161613]/10 bg-white">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-4xl font-bold text-white"
            style={{ backgroundColor: c.primaryColor }}
          >
            {c.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <p className="mt-2.5 truncate font-semibold text-[#161613]">
        {c.name}
      </p>
      {c.tagline && (
        <p className="mt-0.5 truncate text-sm text-[#161613]/55">{c.tagline}</p>
      )}
    </Link>
  );
}

/**
 * Horizontal creator row with snap scrolling and prev/next arrows
 * (Patreon-style "Top-Kreative" sections on the discover page).
 */
export function CreatorSlider({
  eyebrow,
  title,
  href,
  items,
}: {
  eyebrow?: string;
  title: string;
  /** "Alle ansehen" target for the title link. */
  href?: string;
  items: SliderCreator[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  function update() {
    const el = scroller.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  function scrollBy(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.9), behavior: "smooth" });
  }

  const arrow = (dir: 1 | -1, enabled: boolean) => (
    <button
      type="button"
      onClick={() => scrollBy(dir)}
      disabled={!enabled}
      aria-label={dir === 1 ? "Weiter" : "Zurück"}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
        enabled
          ? "bg-[#161613] text-white hover:bg-[#33332e]"
          : "bg-[#161613]/5 text-[#161613]/25",
      )}
    >
      <Icon name="chevron" size={16} className={dir === 1 ? "-rotate-90" : "rotate-90"} />
    </button>
  );

  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/45">
              {eyebrow}
            </p>
          )}
          {href ? (
            <Link
              href={href}
              className="group mt-1 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
            >
              <h2 className="display-serif text-2xl text-[#161613]">
                {title}
              </h2>
              <Icon
                name="chevron"
                size={16}
                className="-rotate-90 text-[#161613]/40 transition group-hover:translate-x-0.5 group-hover:text-[#161613]"
              />
            </Link>
          ) : (
            <h2 className="display-serif mt-1 text-2xl text-[#161613]">{title}</h2>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {arrow(-1, canPrev)}
          {arrow(1, canNext)}
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={update}
        className="scrollbar-none -mx-1 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-1"
      >
        {items.map((c) => (
          <CreatorTile key={c.slug} c={c} />
        ))}
      </div>
    </section>
  );
}
