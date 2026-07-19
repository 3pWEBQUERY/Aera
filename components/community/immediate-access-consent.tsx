"use client";

import Link from "next/link";
import { useId } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Separate, unchecked consent for immediate access to paid digital content. */
export function ImmediateAccessConsent({
  inverse = false,
  className,
}: {
  inverse?: boolean;
  className?: string;
}) {
  const t = useTranslations("legalPurchase");
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-2 text-left text-[11px] leading-4",
        inverse ? "text-white/90" : "text-[#161613]/65",
        className,
      )}
    >
      <input
        id={id}
        name="immediatePerformanceConsent"
        type="checkbox"
        required
        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-current accent-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      />
      <span>
        {t.rich("immediateAccess", {
          withdrawal: (chunks) => (
            <Link
              href="/widerruf"
              target="_blank"
              className="font-semibold underline underline-offset-2"
            >
              {chunks}
            </Link>
          ),
        })}
      </span>
    </label>
  );
}
