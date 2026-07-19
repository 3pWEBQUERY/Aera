"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";
import { Avatar } from "@/components/ui/misc";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";

export interface StoryItem {
  id: string;
  imageUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
}

/** One creator's stories, merged into a single Instagram-style reel. */
export interface StoryGroup {
  authorName: string;
  authorAvatar: string | null;
  items: StoryItem[];
}

interface Pos {
  g: number;
  i: number;
}

/**
 * Grouped story viewer. Each creator's stories are merged into one reel; the
 * fullscreen player steps through a creator's items with a segmented time bar
 * (like Instagram), then moves on to the next creator.
 *
 * - "cards" : Facebook-style large cover cards (community home / stories space)
 * - "ring"  : Instagram-style circular avatars
 */
export function StoryViewer({
  groups = [],
  variant = "ring",
  autoplaySeconds = 5,
}: {
  groups?: StoryGroup[];
  variant?: "ring" | "cards";
  /** Per-image duration; videos advance on their own end. 0 → 5s fallback. */
  autoplaySeconds?: number;
}) {
  const t = useTranslations("community.render.stories");
  const [pos, setPos] = useState<Pos | null>(null);
  const [progress, setProgress] = useState(0);

  const imageMs = (autoplaySeconds > 0 ? autoplaySeconds : 5) * 1000;
  const cur = pos ? groups[pos.g]?.items[pos.i] ?? null : null;
  const group = pos ? groups[pos.g] ?? null : null;
  const viewerRef = useModalAccessibility<HTMLDivElement>({
    open: Boolean(pos),
    onClose: () => setPos(null),
  });

  const goNext = useCallback(() => {
    setPos((c) => {
      if (!c) return c;
      const g = groups[c.g];
      if (c.i < g.items.length - 1) return { g: c.g, i: c.i + 1 };
      if (c.g < groups.length - 1) return { g: c.g + 1, i: 0 };
      return null; // reached the end → close
    });
  }, [groups]);

  const goPrev = useCallback(() => {
    setPos((c) => {
      if (!c) return c;
      if (c.i > 0) return { g: c.g, i: c.i - 1 };
      if (c.g > 0) return { g: c.g - 1, i: groups[c.g - 1].items.length - 1 };
      return c;
    });
  }, [groups]);

  // Lock scroll + keyboard nav while open.
  useEffect(() => {
    if (!pos) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPos(null);
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [pos, goNext, goPrev]);

  // Image timer (videos drive their own progress via timeupdate/ended).
  useEffect(() => {
    setProgress(0);
    if (!cur || cur.videoUrl) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / imageMs);
      setProgress(p);
      if (p >= 1) goNext();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cur, imageMs, goNext]);

  return (
    <>
      {variant === "cards" ? (
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups.map((grp, g) => {
            const cover = grp.items[0];
            return (
              <button
                key={g}
                onClick={() => setPos({ g, i: 0 })}
                aria-label={grp.authorName}
                className="group relative h-52 w-32 shrink-0 overflow-hidden rounded-2xl bg-[#161613]/90 ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
              >
                {cover?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                ) : cover?.videoUrl ? (
                  <video src={cover.videoUrl} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-white/40">
                    <Icon name="videos" size={26} />
                  </span>
                )}
                <span className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/70" />
                <span className="absolute left-3 top-3 rounded-full ring-[3px] ring-[var(--brand)]">
                  <span className="block rounded-full ring-2 ring-[#161613]/90">
                    <Avatar name={grp.authorName} src={grp.authorAvatar} size={38} />
                  </span>
                </span>
                {grp.items.length > 1 && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                    {grp.items.length}
                  </span>
                )}
                <span className="absolute inset-x-2.5 bottom-2.5 truncate text-left text-xs font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  {grp.authorName}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {groups.map((grp, g) => (
            <button key={g} onClick={() => setPos({ g, i: 0 })} className="flex w-20 shrink-0 flex-col items-center gap-1.5">
              <span className="rounded-full bg-gradient-to-tr from-[var(--brand)] to-pink-500 p-[2.5px]">
                <span className="block rounded-full border-2 border-white">
                  <span className="block h-16 w-16 overflow-hidden rounded-full bg-[#161613]/5" style={{ aspectRatio: "1 / 1" }}>
                    {grp.items[0]?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={grp.items[0].imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[#161613]/40">
                        <Icon name="videos" size={20} />
                      </span>
                    )}
                  </span>
                </span>
              </span>
              <span className="w-full truncate text-center text-xs text-[#161613]/60">{grp.authorName}</span>
            </button>
          ))}
        </div>
      )}

      {pos && group && cur && (
        <div
          ref={viewerRef}
          role="dialog"
          aria-modal="true"
          aria-label={group.authorName}
          tabIndex={-1}
          className="fixed inset-0 z-[80] flex flex-col bg-black/95"
          onClick={() => setPos(null)}
        >
          {/* segmented time bar */}
          <div className="flex shrink-0 gap-1 px-3 pt-3" onClick={(e) => e.stopPropagation()}>
            {group.items.map((_, idx) => (
              <span key={idx} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <span
                  className="block h-full rounded-full bg-white"
                  style={{
                    width: idx < pos.i ? "100%" : idx === pos.i ? `${progress * 100}%` : "0%",
                    transition: idx === pos.i && cur.videoUrl ? "width 0.1s linear" : undefined,
                  }}
                />
              </span>
            ))}
          </div>

          {/* header */}
          <div className="flex shrink-0 items-center gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <span className="rounded-full ring-2 ring-white/80">
              <Avatar name={group.authorName} src={group.authorAvatar} size={34} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{group.authorName}</span>
            <button
              onClick={() => setPos(null)}
              aria-label={t("close")}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <Icon name="close" size={22} />
            </button>
          </div>

          {/* media + tap zones */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onClick={(e) => e.stopPropagation()}>
            {cur.videoUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                key={`${pos.g}-${pos.i}`}
                src={cur.videoUrl}
                autoPlay
                playsInline
                className="max-h-full max-w-full rounded-lg"
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration > 0) setProgress(v.currentTime / v.duration);
                }}
                onEnded={goNext}
              />
            ) : cur.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cur.imageUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
            ) : null}

            {/* tap zones: left third = previous, right = next */}
            <button
              aria-label={t("prev")}
              onClick={goPrev}
              className="absolute inset-y-0 left-0 w-1/3 cursor-default focus:outline-none"
            />
            <button
              aria-label={t("next")}
              onClick={goNext}
              className="absolute inset-y-0 right-0 w-2/3 cursor-default focus:outline-none"
            />
          </div>

          {cur.caption && (
            <p className="pointer-events-none shrink-0 px-4 pb-6 text-center text-sm text-white/85">{cur.caption}</p>
          )}
        </div>
      )}
    </>
  );
}
