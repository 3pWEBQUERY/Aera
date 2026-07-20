"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { votePollAction } from "@/app/actions/engage";
import { Icon } from "@/components/dashboard/icons";

export interface PollViewData {
  question: string;
  multiple: boolean;
  totalVotes: number;
  options: { index: number; label: string; votes: number }[];
  myVotes: number[];
}

/**
 * Poll attached to a post: a vote form (single-choice = one click per option,
 * multiple-choice = checkboxes + submit) that flips to a results bar chart once
 * the member has voted. Non-members and everyone with a vote see results, with
 * an option to change their answer.
 */
export function PollBlock({
  slug,
  space,
  postId,
  poll,
  canVote,
}: {
  slug: string;
  space: string;
  postId: string;
  poll: PollViewData;
  canVote: boolean;
}) {
  const t = useTranslations("spaces");
  const hasVoted = poll.myVotes.length > 0;
  const [mode, setMode] = useState<"vote" | "results">(
    hasVoted || !canVote ? "results" : "vote",
  );
  const total = poll.totalVotes;

  return (
    <div className="rounded-2xl border border-[#161613]/10 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold text-[#161613]">{poll.question}</p>
        {poll.multiple && (
          <span className="shrink-0 text-xs text-[#161613]/45">{t("pollMultipleHint")}</span>
        )}
      </div>

      {mode === "vote" && canVote ? (
        <form action={votePollAction} className="space-y-2">
          <input type="hidden" name="tenant" value={slug} />
          <input type="hidden" name="space" value={space} />
          <input type="hidden" name="postId" value={postId} />
          {poll.multiple ? (
            <>
              {poll.options.map((o) => (
                <label
                  key={o.index}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#161613]/12 px-3.5 py-2.5 text-sm text-[#161613] transition hover:border-[color:var(--brand)]"
                >
                  <input
                    type="checkbox"
                    name="optionIndex"
                    value={o.index}
                    defaultChecked={poll.myVotes.includes(o.index)}
                    className="h-4 w-4 rounded border-[#161613]/25 text-[color:var(--brand)]"
                  />
                  {o.label}
                </label>
              ))}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="submit"
                  className="rounded-lg bg-[#161613] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#33332e]"
                >
                  {t("pollVoteCta")}
                </button>
                {total > 0 && (
                  <button
                    type="button"
                    onClick={() => setMode("results")}
                    className="text-xs font-medium text-[#161613]/50 transition hover:text-[#161613]"
                  >
                    {t("pollShowResults")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {poll.options.map((o) => (
                <button
                  key={o.index}
                  type="submit"
                  name="optionIndex"
                  value={o.index}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-[#161613]/12 px-3.5 py-2.5 text-left text-sm text-[#161613] transition hover:border-[color:var(--brand)] hover:bg-[color:var(--brand)]/[0.04]"
                >
                  <span className="h-4 w-4 shrink-0 rounded-full border border-[#161613]/30" />
                  {o.label}
                </button>
              ))}
              {total > 0 && (
                <button
                  type="button"
                  onClick={() => setMode("results")}
                  className="pt-1 text-xs font-medium text-[#161613]/50 transition hover:text-[#161613]"
                >
                  {t("pollShowResults")}
                </button>
              )}
            </>
          )}
        </form>
      ) : (
        <div className="space-y-2">
          {poll.options.map((o) => {
            const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
            const mine = poll.myVotes.includes(o.index);
            return (
              <div
                key={o.index}
                className="relative overflow-hidden rounded-xl border border-[#161613]/10 px-3.5 py-2.5"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-[color:var(--brand)]/[0.12]"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <div className="relative flex items-center justify-between gap-3 text-sm">
                  <span
                    className={
                      mine
                        ? "flex items-center gap-1.5 font-semibold text-[#161613]"
                        : "flex items-center gap-1.5 text-[#161613]/80"
                    }
                  >
                    {mine && <Icon name="check" size={14} className="text-[color:var(--brand)]" />}
                    {o.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-[#161613]/55">{pct}%</span>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1 text-xs text-[#161613]/50">
            <span>
              {total} {t("pollVotesWord")}
            </span>
            {canVote && (
              <button
                type="button"
                onClick={() => setMode("vote")}
                className="font-medium transition hover:text-[#161613]"
              >
                {t("pollChangeVote")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
