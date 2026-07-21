"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";

/**
 * Horizontal category filter bar. Always shows every category, scrolls
 * horizontally with a hidden scrollbar, and exposes prev/next arrows
 * (same interaction as the "Top-Kreative" CreatorSlider).
 */
export function CategoryChips({ active }: { active: string | null }) {
  const t = useTranslations("discover");
  const tCat = useTranslations("categories");
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
  }, []);

  function scrollBy(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  }

  const arrow = (dir: 1 | -1, enabled: boolean) => (
    <button
      type="button"
      onClick={() => scrollBy(dir)}
      disabled={!enabled}
      aria-label={dir === 1 ? t("next") : t("prev")}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/30",
        enabled
          ? "bg-[#161613] text-white hover:bg-[#33332e]"
          : "bg-[#161613]/5 text-[#161613]/25",
      )}
    >
      <Icon name="chevron" size={16} className={dir === 1 ? "-rotate-90" : "rotate-90"} />
    </button>
  );

  const chipClass = (on: boolean) =>
    cn(
      "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors duration-200",
      on
        ? "bg-[#161613] text-white"
        : "border border-[#161613]/10 bg-white text-[#161613]/70 hover:border-[#161613]/35 hover:text-[#161613]",
    );

  return (
    <div className="mt-6 flex items-center gap-3">
      <div
        ref={scroller}
        onScroll={update}
        className="scrollbar-none flex flex-1 gap-2 overflow-x-auto py-1"
      >
        <Link href="/home" className={chipClass(!active)}>
          {t("allChip")}
        </Link>
        {CATEGORIES.map((c) => {
          const on = active === c.key;
          return (
            <Link key={c.key} href={`/home?cat=${c.key}`} className={chipClass(on)}>
              <Icon
                name={c.icon}
                size={15}
                className={on ? "text-white/70" : "text-[#161613]/40"}
              />
              {tCat(c.key)}
            </Link>
          );
        })}
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {arrow(-1, canPrev)}
        {arrow(1, canNext)}
      </div>
    </div>
  );
}
