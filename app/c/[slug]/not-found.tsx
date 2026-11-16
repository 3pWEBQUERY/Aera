import { getTranslations } from "next-intl/server";
import { BackToCommunityLink } from "@/components/community/community-identity";
import { RouteNotFound, routeActionClass } from "@/components/ui/route-not-found";

/**
 * Fehlender Space, Beitrag oder fehlende Seite innerhalb einer Community.
 * Steht im Community-Layout (Logo, Navigation bleiben); den Namen fuer den
 * Rueckweg liefert das Layout per Kontext, weil not-found keine params bekommt.
 */
export default async function CommunityNotFound() {
  const t = await getTranslations("ui.state");
  return (
    <RouteNotFound
      title={t("contentGoneTitle")}
      text={t("contentGoneText")}
      action={<BackToCommunityLink className={routeActionClass} />}
    />
  );
}
