import Link from "next/link";
import Image from "next/image";
import { verifyAccountToken } from "@/lib/tokens";
import { markEmailVerified } from "@/lib/verification";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { ResendVerificationButton } from "@/components/verify-email-banner";
import logoBkButton from "@/public/logo_bk_button.svg";
import { AERA_INK_VARS } from "@/lib/ui-theme";
import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ui.auth");
  // Persoenlicher Link bzw. reine Funktionsseite: gehoert in keinen Index.
  return { title: t("verifyMeta"), robots: NOINDEX };
}

const LINK_CLASS =
  "font-semibold text-[#161613] underline underline-offset-4 hover:opacity-70";

/** Gleicher Rahmen wie /forgot: Beige, Logo, Serifen-Überschrift. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f4f1ea] text-[#161613]" style={AERA_INK_VARS}>
      <div className="mx-auto flex max-w-md flex-col px-5 pb-24 pt-16 md:pt-20">
        <Link
          href="/"
          className="mx-auto mb-8 block w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
        >
          <Image src={logoBkButton} alt="Aera" priority className="h-14 w-14" />
        </Link>
        {children}
      </div>
    </main>
  );
}

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await verifyAccountToken(decodeURIComponent(token), "verify");
  const t = await getTranslations("ui.auth");

  if (!user) {
    // Abgelaufen oder schon benutzt: den neuen Link direkt hier anbieten.
    const current = await getCurrentUser();
    return (
      <Shell>
        <h1 className="display-serif text-4xl leading-[1.05] sm:text-5xl">
          {t("invalidLinkTitle")}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#161613]/65">
          {current?.emailVerifiedAt ? t("verifyInvalidVerified") : t("verifyInvalidText")}
        </p>
        <div className="mt-8 rounded-2xl border border-[#161613]/10 bg-white p-6 sm:p-7">
          {current && !current.emailVerifiedAt ? (
            <ResendVerificationButton email={current.email} />
          ) : current ? (
            <Link href={await homePathFor(current.id)} className={LINK_CLASS}>
              {t("continueToAera")}
            </Link>
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent("/member/account")}`}
              className={LINK_CLASS}
            >
              {t("loginForNewLink")}
            </Link>
          )}
        </div>
      </Shell>
    );
  }

  const alreadyVerified = Boolean(user.emailVerifiedAt);
  if (!alreadyVerified) await markEmailVerified(user.id);

  return (
    <Shell>
      <h1 className="display-serif text-4xl leading-[1.05] sm:text-5xl">
        {alreadyVerified ? t("alreadyVerifiedTitle") : t("verifiedTitle")}
      </h1>
      <p className="mt-4 text-sm leading-6 text-[#161613]/65">
        {alreadyVerified
          ? t("alreadyVerifiedText")
          : t("verifiedText", { name: user.name, email: user.email })}
      </p>
      <p className="mt-8">
        {/* Creator ins Dashboard, Mitglieder nach /home. */}
        <Link
          href={await homePathFor(user.id)}
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--primary)] px-7 text-base font-semibold text-[var(--primary-fg)] transition-colors hover:bg-[var(--primary-hover)]"
        >
          {t("continueToAera")}
        </Link>
      </p>
    </Shell>
  );
}
