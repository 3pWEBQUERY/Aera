"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
          <DashboardNav tenant={tenant} spaces={spaces} plan={plan} />
        </div>
      </Sheet>
    </div>
  );
}
