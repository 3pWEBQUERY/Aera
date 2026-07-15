"use client";

import { usePathname } from "next/navigation";

const BARE_ROUTES = new Set(["/login", "/signup", "/forgot"]);

/**
 * Hides marketing header/footer on focused auth screens (e.g. login, signup).
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
    return <div className="min-h-screen bg-[#f4f1ea]">{children}</div>;
  }

  return (
    <>
      {header}
      {children}
      {footer}
    </>
  );
}
