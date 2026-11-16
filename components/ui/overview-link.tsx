"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * „Zur Uebersicht“ fuer not-found-Seiten, die keine params bekommen:
 * im Dashboard zur Community-Uebersicht, sonst zum festen Ziel.
 */
export function OverviewLink({ base, className }: { base: "dashboard" | "admin"; className?: string }) {
  const t = useTranslations("ui.state");
  const params = useParams<{ slug?: string }>();
  const href = base === "dashboard" && params.slug ? `/dashboard/${params.slug}` : `/${base}`;
  return (
    <Link href={href} className={className}>
      {t("toOverview")}
    </Link>
  );
}
