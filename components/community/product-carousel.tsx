"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Product image gallery. Shows the cover by default; while the pointer hovers
 * the card it auto-advances through the remaining images, then snaps back to
 * the cover on leave. Falls back to a static image for single-image products.
 */
export function ProductCarousel({
  images,
  alt,
  intervalMs = 1200,
}: {
  images: string[];
  alt: string;
  intervalMs?: number;
}) {
  const list = images.filter(Boolean);
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (hover && list.length > 1) {
      timer.current = setInterval(() => setIdx((i) => (i + 1) % list.length), intervalMs);
    } else if (!hover) {
      setIdx(0);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [hover, list.length, intervalMs]);

  if (list.length === 0) return null;

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="flex h-full w-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${idx * 100}%)` }}
      >
        {list.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${u}-${i}`}
            src={u}
            alt={i === 0 ? alt : ""}
            className="h-full w-full shrink-0 object-cover"
            draggable={false}
          />
        ))}
      </div>

      {list.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1">
          {list.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full bg-white shadow transition-all duration-300",
                i === idx ? "w-4 opacity-100" : "w-1.5 opacity-60",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
