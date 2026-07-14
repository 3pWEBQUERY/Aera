"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./icons";

export function SearchBox({ slug }: { slug: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const t = useTranslations("dashboard");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) router.push(`/dashboard/${slug}/search?q=${encodeURIComponent(term)}`);
      }}
      className="w-full max-w-md"
    >
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 transition focus-within:border-violet-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-100">
        <Icon name="search" size={18} className="shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search.placeholder")}
          className="w-full min-w-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
      </div>
    </form>
  );
}
