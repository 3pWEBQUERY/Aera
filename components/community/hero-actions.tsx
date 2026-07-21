"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { cn } from "@/lib/utils";

interface MenuLink {
  href: string;
  label: string;
  icon: IconName;
}

/**
 * Hero CTA row: "Mitglied werden" pill + a "…" button with a dropdown
 * (share, membership, members, leaderboard — dashboard for staff).
 */
export function HeroActions({
  slug,
  isMember,
  isStaff,
  tipsHref,
}: {
  slug: string;
  isMember: boolean;
  isStaff: boolean;
  tipsHref?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function share() {
    const url = `${window.location.origin}/c/${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ url });
        setOpen(false);
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1200);
    } catch {
      // user cancelled / clipboard unavailable — keep the menu open
    }
  }

  const links: MenuLink[] = [
    ...(isMember
      ? [
          { href: `/c/${slug}/library`, label: "Meine Bibliothek", icon: "gallery" as const },
          { href: `/c/${slug}/join`, label: "Deine Mitgliedschaft", icon: "tiers" as const },
        ]
      : [{ href: `/c/${slug}/join`, label: "Kostenlos beitreten", icon: "tiers" as const }]),
    { href: `/c/${slug}/members`, label: "Mitglieder", icon: "members" },
    { href: `/c/${slug}/leaderboard`, label: "Leaderboard", icon: "gamification" },
    ...(isStaff
      ? [{ href: `/dashboard/${slug}`, label: "Dashboard", icon: "dashboard" as const }]
      : []),
  ];

  return (
    <div className="flex items-center gap-2.5">
      {!isMember && (
        <Link
          href={`/c/${slug}/join`}
          className="inline-flex items-center justify-center rounded-full bg-[var(--brand)] px-7 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
        >
          Mitglied werden
        </Link>
      )}

      {tipsHref && (
        <Link
          href={tipsHref}
          className="inline-flex items-center gap-2 rounded-xl border border-[#161613]/25 px-5 py-2.5 text-sm font-semibold text-[#161613] transition-colors hover:border-[#161613]/60 hover:bg-[#161613]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/30"
        >
          <Icon name="heart" size={16} /> Unterstützen
        </Link>
      )}

      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Weitere Optionen"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full text-[#161613] transition-colors",
            "border border-[#161613]/25 hover:border-[#161613]/60 hover:bg-[#161613]/5",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/30",
          )}
        >
          <Icon name="more" size={20} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute left-0 top-full z-40 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          >
            {links.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              >
                <Icon name={l.icon} size={17} className="shrink-0 text-slate-400" />
                {l.label}
              </Link>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={share}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
            >
              <Icon
                name={copied ? "check" : "copy"}
                size={17}
                className={cn("shrink-0", copied ? "text-green-600" : "text-slate-400")}
              />
              {copied ? "Link kopiert!" : "Teilen"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
