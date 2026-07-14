"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sheet } from "@/components/dashboard/sheet";
import { Icon } from "@/components/dashboard/icons";
import { SpaceNav } from "./space-nav";

/** Burger button + full-screen sheet with the community navigation (mobile only). */
export function MobileCommunityNav({
  slug,
  name,
  spaces,
}: {
  slug: string;
  name: string;
  spaces: { slug: string; name: string; type: string; locked: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after navigating.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menü öffnen"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      >
        <Icon name="menu" size={20} />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={name}
        subtitle="Navigation"
        icon="spaces"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SpaceNav slug={slug} spaces={spaces} />
        </div>
      </Sheet>
    </div>
  );
}
