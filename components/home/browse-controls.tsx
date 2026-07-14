"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/icons";

/**
 * Search box + category chips for the discovery home. Both push their state
 * into the URL (`?q=` / `?cat=`) so the server component can filter and the
 * result is shareable / reload-safe.
 */
export function BrowseControls({
  categories,
  activeCat,
  query,
}: {
  categories: string[];
  activeCat: string | null;
  query: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function apply(next: { q?: string; cat?: string | null }) {
    const params = new URLSearchParams();
    const q = next.q !== undefined ? next.q : query;
    const cat = next.cat !== undefined ? next.cat : activeCat;
    if (q) params.set("q", q);
    if (cat) params.set("cat", cat);
    const qs = params.toString();
    router.push(qs ? `/home?${qs}` : "/home");
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: inputRef.current?.value.trim() ?? "" });
        }}
        className="relative"
      >
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          ref={inputRef}
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Nach Kreativen oder Themen suchen"
          className="w-full rounded-full border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[var(--brand)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-ring)]"
        />
      </form>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip label="Alle" active={!activeCat} onClick={() => apply({ cat: null })} />
        {categories.map((c) => (
          <Chip
            key={c}
            label={c}
            active={activeCat === c}
            onClick={() => apply({ cat: activeCat === c ? null : c })}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
        active
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200",
      )}
    >
      {label}
    </button>
  );
}
