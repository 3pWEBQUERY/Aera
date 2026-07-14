"use client";

import { MediaTile, type MediaTileData } from "./media-tile";
import { HScrollRow } from "./h-scroll-row";

/** Horizontal image-package row — same interaction as the other sliders. */
export function MediaSlider({
  title,
  items,
}: {
  title: string;
  items: MediaTileData[];
}) {
  if (items.length === 0) return null;

  return (
    <HScrollRow title={title}>
      {items.map((p) => (
        <div
          key={p.id}
          className="min-w-0 shrink-0 basis-[70%] snap-start sm:basis-[calc(40%-10px)] lg:basis-[calc(28%-11px)]"
        >
          <MediaTile pkg={p} />
        </div>
      ))}
    </HScrollRow>
  );
}
