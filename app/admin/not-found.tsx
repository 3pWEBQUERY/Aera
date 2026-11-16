import { getTranslations } from "next-intl/server";
import { OverviewLink } from "@/components/ui/overview-link";
import { RouteNotFound, routeActionClass } from "@/components/ui/route-not-found";

/** 404 im Admin (z. B. ein geloeschter Blog-Beitrag): Navigation bleibt. */
export default async function AdminNotFound() {
  const t = await getTranslations("ui.state");
  return (
    <RouteNotFound
      title={t("viewNotFoundTitle")}
      text={t("viewNotFoundText")}
      action={<OverviewLink base="admin" className={routeActionClass} />}
    />
  );
}
