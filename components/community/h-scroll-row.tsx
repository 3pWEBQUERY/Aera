"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

/**
 * Section with a title, prev/next arrows and a horizontal snap-scrolling row
 * (hidden scrollbar). Shared shell for the discover-style sliders so every row
 * on the page scrolls and looks identical.
 */
export function HScrollRow({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
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
  }, []);

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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/30",
        enabled
          ? "bg-[#161613] text-white hover:bg-[#33332e]"
          : "bg-[#161613]/5 text-[#161613]/25",
      )}
    >
      <Icon name="chevron" size={16} className={dir === 1 ? "-rotate-90" : "rotate-90"} />
    </button>
  );

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="display-serif text-2xl text-[#161613]">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {arrow(-1, canPrev)}
          {arrow(1, canNext)}
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={update}
        className="scrollbar-none -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-1"
      >
        {children}
      </div>
    </section>
  );
}
