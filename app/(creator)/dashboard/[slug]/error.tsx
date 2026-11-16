"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

/** Fehler in einer Dashboard-Ansicht: Seitenleiste und Kopf bleiben stehen. */
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("ui.state");
  const { slug } = useParams<{ slug: string }>();
  return (
    <RouteError
      error={error}
      retry={retry}
      title={t("viewErrorTitle")}
      link={{ href: `/dashboard/${slug}`, label: t("toOverview") }}
    />
  );
}
