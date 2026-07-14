"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function Switch({
  name,
  defaultChecked = false,
  disabled = false,
  label,
  hint,
}: {
  name: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3",
        disabled ? "opacity-70" : "cursor-pointer hover:bg-slate-50",
      )}
    >
      <input type="hidden" name={name} value={on ? "true" : "false"} />
      <span className="min-w-0">
        {label && <span className="block text-sm font-medium text-slate-800">{label}</span>}
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => setOn((v) => !v)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          on ? "bg-slate-900" : "bg-slate-200",
          disabled && "cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            on ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}
