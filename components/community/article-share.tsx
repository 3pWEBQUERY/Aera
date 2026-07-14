"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/icons";

/** Minimal editorial share row: native share, else copy-to-clipboard. */
export function ArticleShare({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // cancelled / unavailable
    }
  }

  return (
    <div className="flex items-center gap-3 text-[#161613]/60">
      <span className="text-xs font-semibold uppercase tracking-wider">Teilen</span>
      <button
        type="button"
        onClick={share}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] ${
          copied
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-[#161613]/10 text-[#161613]/70 hover:bg-[#161613]/[0.03]"
        }`}
      >
        <Icon name={copied ? "check" : "copy"} size={15} />
        {copied ? "Link kopiert" : "Beitrag teilen"}
      </button>
    </div>
  );
}
