"use client";

import { usePathname } from "next/navigation";
import { LanguagePopover } from "./language-popover";

const BARE_ROUTES = new Set(["/login", "/signup", "/forgot"]);

/**
 * Hides marketing header/footer on focused auth screens (e.g. login, signup).
 *
 * Without the header these screens would lose the language switch, so a
 * light variant sits quietly in the top-right corner instead — someone who
 * lands on /login in the wrong language must be able to fix it right there.
 */
export function MarketingChrome({
  children,
  header,
  footer,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  if (BARE_ROUTES.has(pathname)) {
    return (
      <div className="relative min-h-screen bg-[#f4f1ea]">
        <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
          <LanguagePopover tone="light" />
        </div>
        {children}
      </div>
    );
  }

  return (
    <>
      {header}
      {children}
      {footer}
    </>
  );
}
