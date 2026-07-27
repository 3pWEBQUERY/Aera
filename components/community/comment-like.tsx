"use client";

import { toggleCommentLikeAction } from "@/app/actions/engage";
import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

/**
 * "Gefaellt mir" als eigenes Formular — ein Serveraufruf ohne Umweg ueber
 * JavaScript-Zustand, funktioniert also auch vor der Hydration. Die Zahl
 * daneben zaehlt nur, wenn es etwas zu zaehlen gibt; eine dauerhafte 0
 * traegt keine Information.
 */
export function CommentLikeButton({
  slug,
  space,
  commentId,
  likes,
  liked,
  label,
}: {
  slug: string;
  space: string;
  commentId: string;
  likes: number;
  liked: boolean;
  label: string;
}) {
  return (
    <form action={toggleCommentLikeAction} className="inline-flex">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="space" value={space} />
      <input type="hidden" name="commentId" value={commentId} />
      <button
        type="submit"
        aria-pressed={liked}
        aria-label={label}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold transition",
          liked ? "text-[var(--action-strong)]" : "text-[#161613]/55 hover:text-[#161613]",
        )}
      >
        <Icon name="heart" size={13} fill={liked ? "currentColor" : "none"} />
        {likes > 0 && likes}
      </button>
    </form>
  );
}
