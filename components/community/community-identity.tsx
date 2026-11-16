"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import { useTranslations } from "next-intl";

/**
 * Name und Adresse der Community fuer Teile, die keine params bekommen —
 * vor allem `not-found.tsx` und `error.tsx` unter /c/[slug]. Das Layout
 * stellt sie bereit, so kann „Zurueck zu {community}“ den echten Namen nennen.
 */
const CommunityIdentity = createContext<{ slug: string; name: string } | null>(null);

export function CommunityIdentityProvider({
  slug,
  name,
  children,
}: {
  slug: string;
  name: string;
  children: React.ReactNode;
}) {
  return <CommunityIdentity.Provider value={{ slug, name }}>{children}</CommunityIdentity.Provider>;
}

export function useCommunityIdentity() {
  return useContext(CommunityIdentity);
}

/** „Zurueck zu {community}“ — oder neutral zur Startseite, falls ausserhalb. */
export function BackToCommunityLink({ className }: { className?: string }) {
  const identity = useCommunityIdentity();
  const t = useTranslations("ui");
  return (
    <Link href={identity ? `/c/${identity.slug}` : "/"} className={className}>
      {identity
        ? t("state.backToCommunity", { community: identity.name })
        : t("frontend.notFound.home")}
    </Link>
  );
}
