import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/profile";
import { publicStrings } from "@/lib/i18n";
import { isUnlocked } from "@/lib/gate";
import { parseBlockConfig } from "@/lib/blocks";
import { communityUrl, profileUrl } from "@/lib/url";
import { ProfilePage } from "@/components/page/profile-page";
import { PageTracker } from "@/components/page/tracker";
import { GateScreen } from "@/components/page/gate-screen";
import type { PageData } from "@/components/page/types";

/**
 * Die öffentliche Seite. Erreichbar als `{handle}.aeli.so` (der Proxy schreibt
 * darauf um) und unter `/p/{handle}` — dieselbe Seite, damit die lokale
 * Entwicklung ohne Wildcard-DNS auskommt.
 *
 * Sie liest bewusst KEINE Sitzung. Ein eingeloggter Besitzer sieht hier exakt
 * das, was alle sehen; sein Entwurf lebt im Studio. Das hält die Seite für
 * jeden gleich — und damit cachebar statt pro Anfrage neu gebaut.
 */

/**
 * Dynamisch, und zwar aus zwei konkreten Gründen: die Seite liest
 * `Accept-Language` (damit ein englischsprachiger Besucher „Subscribe“ statt
 * „Eintragen“ sieht) und bei gesetzter Schranke das Freischalt-Cookie. Beides
 * ist pro Besucher verschieden, also gibt es keine gemeinsame Fassung, die man
 * cachen könnte. Der Preis ist überschaubar: zwei indizierte Abfragen, die
 * sich innerhalb einer Anfrage über `cache()` teilen.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);
  if (!profile) return { title: "Nicht gefunden", robots: { index: false } };

  const title = profile.seoTitle || profile.displayName;
  const description =
    profile.seoDescription ||
    profile.bio ||
    `Alle Links von ${profile.displayName} an einer Stelle.`;
  const url = profileUrl(profile.handle);

  return {
    title,
    description,
    // Eine Bio-Seite lebt davon, geteilt zu werden. Die Adresse im Kanonischen
    // ist deshalb die Subdomain — nicht der interne Pfad, über den der Proxy
    // sie ausliefert.
    alternates: { canonical: url },
    robots: profile.seoNoindex ? { index: false, follow: false } : undefined,
    openGraph: { type: "profile", title, description, url },
    twitter: { card: "summary_large_image", title, description },
    // Ohne eigenes Bild greift `opengraph-image.tsx` daneben und zeichnet eine
    // Karte aus Name, Handle und Theme-Farben. Ein gesetztes Bild gewinnt —
    // deshalb steht es hier und sonst nichts.
    ...(profile.seoImageUrl
      ? {
          openGraph: {
            type: "profile" as const,
            title,
            description,
            url,
            images: [{ url: profile.seoImageUrl, width: 1200, height: 630 }],
          },
          twitter: {
            card: "summary_large_image" as const,
            title,
            description,
            images: [profile.seoImageUrl],
          },
        }
      : {}),
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);
  if (!profile) notFound();

  const strings = await publicStrings();

  if (profile.gate !== "NONE" && !(await isUnlocked(profile.id, profile.gate))) {
    return (
      <GateScreen
        profileId={profile.id}
        gate={profile.gate}
        displayName={profile.displayName}
        avatarUrl={profile.avatarUrl}
        theme={profile.theme}
        strings={strings}
      />
    );
  }

  const page: PageData = {
    profileId: profile.id,
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    bannerUrl: profile.bannerUrl,
    socials: profile.socials,
    theme: profile.theme,
    blocks: profile.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      title: block.title,
      subtitle: block.subtitle,
      href: block.href,
      mediaUrl: block.mediaUrl,
      icon: block.icon,
      config: parseBlockConfig(block.config),
    })),
    showBranding: profile.showBranding,
    gate: profile.gate,
    community: profile.linkedTenant
      ? {
          name: profile.linkedTenant.name,
          url: communityUrl(profile.linkedTenant),
          logoUrl: profile.linkedTenant.logoUrl,
          tagline: profile.linkedTenant.tagline,
        }
      : null,
    isLive: profile.isLive,
    publicUrl: profileUrl(profile.handle),
  };

  return (
    <>
      <ProfilePage page={page} mode="live" strings={strings} />
      <PageTracker profileId={profile.id} />
    </>
  );
}
