"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { voteRequestAction } from "@/app/actions/requests";
import { Icon } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

/** Reddit-style up/down vote pill for a member wish. Optimistic. */
export function RequestVoteControl({
  tenant,
  space,
  requestId,
  score,
  myVote,
  canVote,
}: {
  tenant: string;
  space: string;
  requestId: string;
  score: number;
  myVote: "UP" | "DOWN" | null;
  canVote: boolean;
}) {
  const t = useTranslations("spaces");
  const [vote, setVote] = useState<"UP" | "DOWN" | null>(myVote);
  const [value, setValue] = useState(score);
  const [, start] = useTransition();

  function cast(dir: "UP" | "DOWN") {
    if (!canVote) return;
    let next: "UP" | "DOWN" | null = dir;
    let delta = 0;
    if (vote === dir) {
      next = null;
      delta = dir === "UP" ? -1 : 1;
    } else {
      delta = dir === "UP" ? (vote === "DOWN" ? 2 : 1) : vote === "UP" ? -2 : -1;
    }
    setVote(next);
    setValue((v) => v + delta);
    const fd = new FormData();
    fd.set("tenant", tenant);
    fd.set("space", space);
    fd.set("requestId", requestId);
    fd.set("dir", dir);
    start(() => {
      void voteRequestAction(fd);
    });
  }

  return (
    <div className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-[#161613]/[0.03] py-1.5">
      <button
        type="button"
        disabled={!canVote}
        onClick={() => cast("UP")}
        aria-label={t("upvote")}
        aria-pressed={vote === "UP"}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md transition",
          canVote && "hover:bg-[#161613]/5",
          vote === "UP" ? "text-orange-600" : "text-[#161613]/45",
          !canVote && "cursor-not-allowed opacity-60",
        )}
      >
        <Icon name="chevron" size={18} className="rotate-180" />
      </button>
      <span
        className={cn(
          "py-0.5 text-sm font-bold tabular-nums",
          vote === "UP" ? "text-orange-600" : vote === "DOWN" ? "text-blue-600" : "text-[#161613]/80",
        )}
      >
        {value}
      </span>
      <button
        type="button"
        disabled={!canVote}
        onClick={() => cast("DOWN")}
        aria-label={t("downvote")}
        aria-pressed={vote === "DOWN"}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md transition",
          canVote && "hover:bg-[#161613]/5",
          vote === "DOWN" ? "text-blue-600" : "text-[#161613]/45",
          !canVote && "cursor-not-allowed opacity-60",
        )}
      >
        <Icon name="chevron" size={18} />
      </button>
    </div>
  );
}
