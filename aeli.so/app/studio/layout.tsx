import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { profileUrl, profileUrlLabel } from "@/lib/url";
import { logoutAction } from "@/app/actions/auth";
import { BrandLink } from "@/components/brand";
import { StudioNav } from "@/components/studio/studio-nav";
import { PublishBar } from "@/components/studio/publish-bar";

/**
 * Die Hülle des Studios.
 *
 * `requireProfile()` steht hier und nicht in jeder Seite: das Layout läuft vor
 * allen Kindern, also gibt es keinen Pfad unter `/studio`, der ohne Profil
 * gerendert wird. Nebenbei setzt der Aufruf den Datenbank-Kontext für alles,
 * was danach kommt.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <BrandLink />

          <div className="order-3 -mb-3 w-full border-t border-line pt-1 lg:order-none lg:mb-0 lg:w-auto lg:border-0 lg:pt-0">
            <StudioNav />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <PublishBar
              published={profile.status === "PUBLISHED"}
              url={profileUrl(profile.handle)}
              urlLabel={profileUrlLabel(profile.handle)}
            />
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg px-2.5 py-2 text-xs font-medium text-ash transition-colors hover:text-chalk"
              >
                Abmelden
              </button>
            </form>
          </div>
        </div>
      </header>

      {profile.status !== "PUBLISHED" && (
        <p className="border-b border-line bg-ink-2 px-5 py-2.5 text-center text-xs text-ash">
          Diese Seite ist noch ein Entwurf — unter{" "}
          <span className="text-chalk">{profileUrlLabel(profile.handle)}</span> findet gerade niemand
          etwas.{" "}
          <Link href="/studio" className="text-signal underline underline-offset-4">
            Wenn sie steht, oben veröffentlichen.
          </Link>
        </p>
      )}

      <main className="mx-auto max-w-[88rem] px-5 py-8">{children}</main>
    </div>
  );
}
