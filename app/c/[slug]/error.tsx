"use client";

import { useTranslations } from "next-intl";
import { useCommunityIdentity } from "@/components/community/community-identity";
import { RouteError } from "@/components/ui/route-error";

/** Fehler in einer Community-Seite: Layout mit Navigation bleibt stehen. */
export default function CommunityError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("ui.state");
  const identity = useCommunityIdentity();
  return (
    <RouteError
      error={error}
      retry={retry}
      link={
        identity
          ? { href: `/c/${identity.slug}`, label: t("backToCommunity", { community: identity.name }) }
          : undefined
      }
    />
  );
}
