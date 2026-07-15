import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/forms/account-forms";
import logoBkButton from "@/public/logo_bk_button.svg";

export async function generateMetadata() {
  const t = await getTranslations("uiMigration.auth");
  return { title: t("forgotMeta") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("authPages");

  return (
    <main
      className="min-h-screen bg-[#f4f1ea] text-[#161613]"
      style={{ "--brand": "#161613" } as React.CSSProperties}
    >
      <div className="mx-auto flex max-w-md flex-col px-5 pb-24 pt-16 md:pt-20">
        <Link
          href="/"
          className="mx-auto mb-8 block w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
        >
          <Image src={logoBkButton} alt="Aera" priority className="h-14 w-14" />
        </Link>
        <h1 className="display-serif text-4xl leading-[1.05] sm:text-5xl">
          {t("forgotTitle")}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#161613]/60">{t("forgotText")}</p>

        <div className="mt-8 rounded-2xl border border-[#161613]/10 bg-white p-6 sm:p-7">
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-sm text-[#161613]/60">
          {t("backTo")}{" "}
          <Link
            href="/login"
            className="font-semibold text-[#161613] underline underline-offset-4 hover:opacity-70"
          >
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}
