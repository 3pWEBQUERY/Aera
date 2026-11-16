"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

/** Fehler im Plattform-Admin: Navigation bleibt stehen. */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("ui.state");
  return (
    <RouteError
      error={error}
      retry={retry}
      title={t("viewErrorTitle")}
      link={{ href: "/admin", label: t("toOverview") }}
    />
  );
}
