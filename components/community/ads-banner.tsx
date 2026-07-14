"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface AdBannerItem {
  id: string;
  title: string;
  mediaUrl: string;
  mediaType: "IMAGE" | "VIDEO";
  targetUrl: string | null;
  /** Seconds this ad stays visible before the rotation advances. */
  durationSec: number;
}

/**
 * Rotating creator-ad banner for the community home page. Each ad defines its
 * own display duration; rotation pauses while hovered. A single ad renders as
 * a static banner. Always labelled "Anzeige".
 */
export function AdsBanner({ ads }: { ads: AdBannerItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = ads.length;
  const current = ads[index % count];

  useEffect(() => {
    if (count <= 1 || paused) return;
    timer.current = setTimeout(
      () => setIndex((i) => (i + 1) % count),
      Math.max(3, current.durationSec) * 1000,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, paused, count, current.durationSec]);

  if (count === 0) return null;

  const media = (
    <div className="relative aspect-[2/1] w-full overflow-hidden bg-[#161613]/5 sm:aspect-[3/1]">
      {ads.map((ad, i) => (
        <div
          key={ad.id}
          className={cn(
            "absolute inset-0 transition-opacity duration-500",
            i === index % count ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={i !== index % count}
        >
          {ad.mediaType === "VIDEO" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={ad.mediaUrl}
              muted
              loop
              playsInline
              autoPlay
              preload="metadata"
              className="h-full w-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.mediaUrl} alt={ad.title} className="h-full w-full object-cover" />
          )}
        </div>
      ))}

      {/* Honesty label + title bar (solid ink, no gradient). */}
      <span className="absolute left-3 top-3 rounded-full bg-[#161613]/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
        Anzeige
      </span>
      {current.title && (
        <span className="absolute bottom-3 left-3 max-w-[80%] truncate rounded-full bg-white/90 px-3.5 py-1.5 text-sm font-semibold text-[#161613]">
          {current.title}
        </span>
      )}
    </div>
  );

  return (
    <section
      aria-label="Werbung"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="overflow-hidden rounded-2xl border border-[#161613]/10 bg-white"
    >
      {current.targetUrl ? (
        <a
          href={current.targetUrl}
          target={/^https?:\/\//i.test(current.targetUrl) ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/30"
        >
          {media}
        </a>
      ) : (
        media
      )}

      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2.5">
          {ads.map((ad, i) => (
            <button
              key={ad.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Werbung ${i + 1} anzeigen`}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index % count
                  ? "w-5 bg-[#161613]"
                  : "w-1.5 bg-[#161613]/20 hover:bg-[#161613]/40",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
