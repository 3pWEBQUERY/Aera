"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/dashboard/sheet";
import { Icon } from "@/components/dashboard/icons";
import { Avatar } from "@/components/ui/misc";
import { AdminNav } from "./admin-nav";

/**
 * Kopfzeile + Navigation fuer schmale Bildschirme (< md). Die Seitenleiste ist
 * dort ausgeblendet; ohne diese Leiste gaebe es keinen Weg zwischen den
 * Admin-Seiten. Das Sheet uebernimmt Fokusfalle, Escape und die Rueckgabe des
 * Fokus an den Menue-Button (useModalAccessibility).
 */
export function AdminMobileNav({
  badges = {},
  admin,
}: {
  badges?: Record<string, number>;
  admin: { name: string; avatarUrl: string | null };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("admin");

  // Nach dem Navigieren schliessen.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const unread = Object.values(badges).reduce((sum, n) => sum + (n > 0 ? n : 0), 0);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--action)] text-sm font-black text-[var(--action-fg)]"
      >
        A
      </span>
      <Link href="/admin" className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
        {t("brand")}
      </Link>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? t("nav.openMenuUnread", { count: unread }) : t("nav.openMenu")}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      >
        <Icon name="menu" size={20} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--brand)] ring-2 ring-white"
          />
        )}
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("brand")}
        subtitle={t("brandSubtitle")}
        icon="dashboard"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <AdminNav badges={badges} />
        </div>
        <div className="shrink-0 border-t border-slate-100 p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-slate-50"
          >
            <Avatar name={admin.name} src={admin.avatarUrl} size={30} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-800">{admin.name}</span>
              <span className="block truncate text-xs text-slate-500">{t("backToDashboard")}</span>
            </span>
          </Link>
        </div>
      </Sheet>
    </header>
  );
}
