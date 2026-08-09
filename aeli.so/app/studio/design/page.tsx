import type { Metadata } from "next";
import { profileAeraContent, profileTipsEnabled, requireProfile } from "@/lib/profile";
import { studioPageData } from "@/lib/page-data";
import { parseTheme } from "@/lib/themes";
import { parseSocials } from "@/lib/socials";
import { profileUrl, profileUrlLabel } from "@/lib/url";
import { DesignStudio } from "@/components/studio/design-studio";

export const metadata: Metadata = { title: "Design", robots: { index: false } };

export default async function DesignPage() {
  const profile = await requireProfile();
  const [aera, tipsEnabled] = await Promise.all([
    profileAeraContent(profile, "de"),
    profileTipsEnabled(profile),
  ]);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Design</h1>
        <p className="mt-1 text-sm text-ash">
          Rechts siehst du sofort, was passiert. Gespeichert wird erst, wenn du es sagst.
        </p>
      </header>

      <DesignStudio
        page={studioPageData(profile, { onlyVisible: true, aera, tipsEnabled })}
        initialTheme={parseTheme(profile.theme)}
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
