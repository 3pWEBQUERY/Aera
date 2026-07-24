import { cn } from "@/lib/utils";
import type { PlanKey } from "@/lib/plan-features";
import { Icon } from "./icons";

/**
 * Package chip. Colour is fixed per package so a creator learns the ladder
 * visually: slate → indigo → violet → amber.
 */
const TONE: Record<PlanKey, string> = {
  FREE: "bg-slate-100 text-slate-600 ring-slate-200",
  STARTER: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  PRO: "bg-violet-50 text-violet-700 ring-violet-200",
  SCALE: "bg-amber-50 text-amber-700 ring-amber-200",
};

const PLAN_LABEL: Record<PlanKey, string> = {
  FREE: "Free",
  STARTER: "Starter",
  PRO: "Pro",
  SCALE: "Scale",
};

export function PlanBadge({
  plan,
  prefix,
  locked = false,
  className,
}: {
  plan: PlanKey;
  /** Optional leading word, e.g. "ab". */
  prefix?: string;
  locked?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        TONE[plan],
        className,
      )}
    >
      {locked && <Icon name="lock" size={11} />}
      {prefix ? `${prefix} ` : ""}
      {PLAN_LABEL[plan]}
    </span>
  );
}

export { PLAN_LABEL };
