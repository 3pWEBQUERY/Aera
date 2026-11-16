"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sheet } from "./sheet";
import { DashboardNav, type NavSpace } from "./dashboard-nav";
import type { PlanKey } from "@/lib/plan-features";
import { Icon } from "./icons";

/** Burger button + full-screen sheet with the dashboard navigation (mobile only). */
export function MobileDashboardNav({
  tenant,
  spaces,
  plan,
}: {
  tenant: { slug: string; name: string; logoUrl: string | null; primaryColor: string };
  spaces: NavSpace[];
  plan: PlanKey;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("dashboard");
  const tRail = useTranslations("ui.dashboard");

  // Close after navigating.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("nav.openAria")}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      >
        <Icon name="menu" size={20} />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tenant.name}
        subtitle={t("nav.mobileSubtitle")}
        icon="dashboard"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Link
            href="/dashboard"
            className="mx-4 mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:hidden"
          >
            <Icon name="chevron" size={16} className="rotate-90" />
            {tRail("allCommunities")}
          </Link>
          <DashboardNav tenant={tenant} spaces={spaces} plan={plan} />
        </div>
      </Sheet>
    </div>
  );
}
