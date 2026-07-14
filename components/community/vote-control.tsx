"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { voteAction } from "@/app/actions/engage";
import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

export function VoteControl({
  tenant,
  space,
  targetType,
  targetId,
  postId,
  score,
  myVote,
  layout = "vertical",
}: {
  tenant: string;
  space: string;
  targetType: "post" | "comment";
  targetId: string;
  postId: string;
  score: number;
  myVote: "UP" | "DOWN" | null;
  layout?: "vertical" | "horizontal";
}) {
  const t = useTranslations("spaces");
  const [vote, setVote] = useState<"UP" | "DOWN" | null>(myVote);
  const [value, setValue] = useState(score);
  const [, start] = useTransition();

  function cast(dir: "UP" | "DOWN") {
    let nextVote: "UP" | "DOWN" | null = dir;
    let delta = 0;
    if (vote === dir) {
      nextVote = null;
      delta = dir === "UP" ? -1 : 1;
    } else {
      delta = dir === "UP" ? (vote === "DOWN" ? 2 : 1) : vote === "UP" ? -2 : -1;
    }
    setVote(nextVote);
    setValue((v) => v + delta);
    const fd = new FormData();
    fd.set("tenant", tenant);
    fd.set("space", space);
    fd.set("targetType", targetType);
    fd.set("targetId", targetId);
    fd.set("postId", postId);
    fd.set("dir", dir);
    start(() => {
      void voteAction(fd);
    });
  }

  const vertical = layout === "vertical";
  return (
    <div className={cn("flex items-center", vertical ? "flex-col" : "gap-1.5")}>
      <button
        type="button"
        onClick={() => cast("UP")}
        aria-label={t("upvote")}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[#161613]/5",
          vote === "UP" ? "text-orange-600" : "text-[#161613]/50",
        )}
      >
        <Icon name="chevron" size={18} className="rotate-180" />
      </button>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          vote === "UP" ? "text-orange-600" : vote === "DOWN" ? "text-blue-600" : "text-[#161613]/80",
        )}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => cast("DOWN")}
        aria-label={t("downvote")}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[#161613]/5",
          vote === "DOWN" ? "text-blue-600" : "text-[#161613]/50",
        )}
      >
        <Icon name="chevron" size={18} />
      </button>
    </div>
  );
}
