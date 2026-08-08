import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOwnProfile } from "@/lib/profile";
import { profileUrlLabelParts } from "@/lib/url";
import { BrandLink } from "@/components/brand";
import { ClaimFlow } from "@/components/onboarding/claim-flow";

export const metadata: Metadata = {
  title: "Handle sichern",
  robots: { index: false },
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?weiter=/onboarding");
  // Wer schon eine Seite hat, hat hier nichts mehr zu holen — ein zweites
  // Profil pro Konto gibt es nicht (`AeliProfile.userId` ist unique).
  if (await getOwnProfile()) redirect("/studio");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <BrandLink />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
        <p className="text-sm font-medium text-signal">Fast geschafft, {user.name.split(" ")[0]}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Such dir deinen Handle aus
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-ash">
          Er wird die Adresse deiner Seite. Ändern kannst du ihn später — dann führt die alte
          Adresse allerdings ins Leere, also nimm einen, hinter dem du stehst.
        </p>

        <div className="mt-10">
          <ClaimFlow
            defaultName={user.name}
            // Aus dem Hero der Startseite mitgebracht. Fehlt er, wird der Name
            // vorgeschlagen — besser als ein leeres Feld, an dem man hängen
            // bleibt, bevor man überhaupt angefangen hat.
            wishHandle={(await searchParams).h ?? ""}
            url={profileUrlLabelParts()}
          />
        </div>
      </main>
    </div>
  );
}
