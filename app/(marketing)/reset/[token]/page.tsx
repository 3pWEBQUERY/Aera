import Link from "next/link";
import Image from "next/image";
import { verifyAccountToken } from "@/lib/tokens";
import { ResetPasswordForm } from "@/components/forms/account-forms";
import { getTranslations } from "next-intl/server";
import logoBkButton from "@/public/logo_bk_button.svg";
import { AERA_INK_VARS } from "@/lib/ui-theme";

export async function generateMetadata() {
  const t = await getTranslations("ui.auth");
  return { title: t("resetMeta") };
}

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

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await verifyAccountToken(decodeURIComponent(token), "reset");
  const t = await getTranslations("ui.auth");

  if (!user) {
    return (
      <Shell>
        <h1 className="display-serif text-4xl leading-[1.05] sm:text-5xl">
          {t("invalidLinkTitle")}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#161613]/65">{t("resetInvalidText")}</p>
        <p className="mt-8">
          <Link
            href="/forgot"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--primary)] px-7 text-base font-semibold text-[var(--primary-fg)] transition-colors hover:bg-[var(--primary-hover)]"
          >
            {t("requestNewLink")}
          </Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="display-serif text-4xl leading-[1.05] sm:text-5xl">{t("resetTitle")}</h1>
      <p className="mt-4 text-sm leading-6 text-[#161613]/65">
        {t("forAccount", { email: user.email })}
      </p>
      <div className="mt-8 rounded-2xl border border-[#161613]/10 bg-white p-6 sm:p-7">
        <ResetPasswordForm token={decodeURIComponent(token)} />
      </div>
    </Shell>
  );
}
