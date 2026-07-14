"use client";

import { useTranslations, useLocale } from "next-intl";
import { VideoTile, type PostTileData } from "./post-tile";
import { HScrollRow } from "./h-scroll-row";

/** Horizontal video row — video-thumbnail tiles with snap scrolling. */
export function VideoSlider({
  title,
  items,
}: {
  title: string;
  items: PostTileData[];
}) {
  const t = useTranslations("community.render.postTile");
  const locale = useLocale();
  if (items.length === 0) return null;

  return (
    <HScrollRow title={title}>
      {items.map((p) => (
        <div
          key={p.id}
          className="min-w-0 shrink-0 basis-[85%] snap-start sm:basis-[calc(50%-8px)] lg:basis-[calc(33.333%-11px)]"
        >
          <VideoTile post={p} locale={locale} memberLabel={t("becomeMember")} />
        </div>
      ))}
    </HScrollRow>
  );
}
