"use client";

import { usePathname } from "next/navigation";

/**
 * Dashboard page container. Most pages get a centered, padded column; the AI
 * assistant runs edge-to-edge (full width & height, no padding) so its two-pane
 * chat sits flush against the sidebar.
 */
export function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed =
    (pathname?.endsWith("/assistant") || pathname?.endsWith("/media/studio")) ?? false;

  if (fullBleed) {
    return (
      <main className="h-[calc(100dvh-4rem)] min-w-0 flex-1 overflow-hidden">{children}</main>
    );
  }
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-7">{children}</div>
    </main>
  );
}
