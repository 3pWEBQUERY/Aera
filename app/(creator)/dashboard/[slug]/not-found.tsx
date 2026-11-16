import { getTranslations } from "next-intl/server";
import { OverviewLink } from "@/components/ui/overview-link";
import { RouteNotFound, routeActionClass } from "@/components/ui/route-not-found";

/** 404 im Dashboard: Seitenleiste bleibt, der Weg zurueck fuehrt zur Uebersicht. */
export default async function DashboardNotFound() {
  const t = await getTranslations("ui.state");
  return (
    <RouteNotFound
      title={t("viewNotFoundTitle")}
      text={t("viewNotFoundText")}
      action={<OverviewLink base="dashboard" className={routeActionClass} />}
    />
  );
}
