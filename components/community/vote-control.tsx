"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { voteAction } from "@/app/actions/engage";
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
  // Zustand nie nur über Farbe: aktive Stimme = gefüllter Pfeil + aria-pressed,
  // und der Name nennt den aktuellen Punktestand.
  const btn = (dir: "UP" | "DOWN") => {
    const active = vote === dir;
    return (
      <button
        type="button"
        onClick={() => cast(dir)}
        aria-pressed={active}
        aria-label={t(dir === "UP" ? "upvoteAria" : "downvoteAria", { score: value })}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[#161613]/5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
          active
            ? dir === "UP"
              ? "text-orange-700"
              : "text-blue-700"
            : "text-[#161613]/65 hover:text-[#161613]",
        )}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          className={dir === "DOWN" ? "rotate-180" : undefined}
        >
          <path
            d="M8 2.5 13.5 9H10.5v4.5h-5V9H2.5Z"
            fill={active ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
  };
  return (
    <div className={cn("flex items-center", vertical ? "flex-col" : "gap-1")}>
      {btn("UP")}
      <span
        aria-hidden="true"
        className={cn(
          "text-sm font-semibold tabular-nums",
          vote === "UP" ? "text-orange-700" : vote === "DOWN" ? "text-blue-700" : "text-[#161613]/80",
        )}
      >
        {value}
      </span>
      {btn("DOWN")}
    </div>
  );
}
