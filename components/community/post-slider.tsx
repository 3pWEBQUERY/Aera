"use client";

import { useTranslations, useLocale } from "next-intl";
import { PostTile, type PostTileData } from "./post-tile";
import { HScrollRow } from "./h-scroll-row";

/**
 * Horizontal post row showing two tiles at a time with snap scrolling and
 * prev/next arrows (same interaction as the discover-page rows).
 */
export function PostSlider({
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
          className="min-w-0 shrink-0 basis-[85%] snap-start sm:basis-[calc(50%-8px)]"
        >
          <PostTile post={p} locale={locale} memberLabel={t("becomeMember")} />
        </div>
      ))}
    </HScrollRow>
  );
}
