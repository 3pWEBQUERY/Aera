import { cn } from "@/lib/utils";

/**
 * Cover image rendered with a stored focal point (offsetX/offsetY as
 * object-position percentages) and an optional zoom (scale). The same values
 * drive the composer preview, the topic banner and the list-card thumbnail, so
 * the crop the creator picks looks consistent everywhere regardless of the
 * container's aspect ratio.
 */
export function CoverBanner({
  url,
  offsetX = 50,
  offsetY = 50,
  zoom = 100,
  aspect = "16 / 5",
  rounded,
  className,
}: {
  url: string;
  offsetX?: number;
  offsetY?: number;
  zoom?: number;
  /** CSS aspect-ratio value, e.g. "16 / 5". */
  aspect?: string;
  rounded?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("relative w-full overflow-hidden bg-[#161613]/5", rounded, className)}
      style={{ aspectRatio: aspect }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover"
        style={{
          objectPosition: `${offsetX}% ${offsetY}%`,
          transform: zoom > 100 ? `scale(${zoom / 100})` : undefined,
          transformOrigin: `${offsetX}% ${offsetY}%`,
        }}
      />
    </div>
  );
}
