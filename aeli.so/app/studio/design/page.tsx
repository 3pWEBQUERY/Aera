import type { Metadata } from "next";
import { profileAeraContent, profileTipsEnabled, requireProfile } from "@/lib/profile";
import { studioPageData } from "@/lib/page-data";
import { parseTheme } from "@/lib/themes";
import { parseSocials } from "@/lib/socials";
import { profileUrl, profileUrlLabel } from "@/lib/url";
import { DesignStudio } from "@/components/studio/design-studio";
import { CardBar } from "@/components/studio/card-bar";

export const metadata: Metadata = { title: "Design", robots: { index: false } };

export default async function DesignPage({
  searchParams,
}: {
  searchParams: Promise<{ karte?: string }>;
}) {
  const profile = await requireProfile();
  const [aera, tipsEnabled] = await Promise.all([
    profileAeraContent(profile, "de"),
    profileTipsEnabled(profile),
  ]);

  // Ohne `?karte=` gestaltet man die SEITE — das Design, das alle Karten
  // erben. Mit `?karte=` gestaltet man genau diese eine.
  const wished = (await searchParams).karte;
  const card = wished ? (profile.cards.find((entry) => entry.slug === wished) ?? null) : null;
  const pageTheme = parseTheme(profile.theme);
  const ownTheme = card?.theme != null;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Design</h1>
        <p className="mt-1 text-sm text-ash">
          {card
            ? `Nur für die Karte „${card.title}“. Rechts siehst du sofort, was passiert.`
            : "Die Grundgestaltung. Karten ohne eigenes Design folgen ihr."}
        </p>
      </header>

      <CardBar
        cards={profile.cards.map((entry) => ({
          id: entry.id,
          slug: entry.slug,
          title: entry.title,
          icon: entry.icon,
          isVisible: entry.isVisible,
          blockCount: entry.blocks.length,
        }))}
        activeId={card?.id ?? ""}
        basePath="/studio/design"
        pageTab="Seite"
      />

      <DesignStudio
        page={studioPageData(profile, {
          onlyVisible: true,
          aera,
          tipsEnabled,
          // Mit ausgewaehlter Karte nur diese; ohne den ganzen Stapel, damit
          // man sieht, welche Karten der Grundgestaltung folgen.
          onlyCardId: card?.id,
        })}
        scope={
          card
            ? { kind: "card", cardId: card.id, cardTitle: card.title, ownTheme }
            : { kind: "page" }
        }
        initialTheme={card && ownTheme ? parseTheme(card.theme) : pageTheme}
        identity={{
          displayName: profile.displayName,
          bio: profile.bio ?? "",
          avatarUrl: profile.avatarUrl ?? "",
          bannerUrl: profile.bannerUrl ?? "",
        }}
        socials={parseSocials(profile.socials)}
        published={profile.status === "PUBLISHED"}
        publicUrl={profileUrl(profile.handle)}
        publicUrlLabel={profileUrlLabel(profile.handle)}
      />
    </>
  );
}
