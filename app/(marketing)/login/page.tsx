import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { safeRelativePath } from "@/lib/safe-redirect";
import { LoginForm } from "@/components/forms/auth-forms";
import logoBkButton from "@/public/logo_bk_button.svg";
import { AERA_INK_VARS } from "@/lib/ui-theme";
import type { Metadata } from "next";
import { buildPlatformPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tSeo] = await Promise.all([
    getTranslations("ui.auth"),
    getTranslations("marketing.seo"),
  ]);
  return buildPlatformPageMetadata({
    title: t("loginMeta"),
    description: tSeo("loginDescription"),
    path: "/login",
  });
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next, reset } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(safeRelativePath(next, "/home"));
  const t = await getTranslations("authPages");

  return (
    <main
      className="min-h-screen bg-[#f4f1ea] text-[#161613]"
      style={AERA_INK_VARS}
    >
      <div className="mx-auto flex max-w-md flex-col px-5 pb-24 pt-16 md:pt-20">
        <Link href="/" className="mx-auto mb-8 block w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25">
          <Image
            src={logoBkButton}
            alt="Aera"
            priority
            className="h-14 w-14"
          />
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/65">
          {t("loginEyebrow")}
        </p>
        <h1 className="display-serif mt-3 text-4xl leading-[1.05] sm:text-5xl">
          {t("loginTitleA")}
          <br />
          <span className="text-[#161613]/65">{t("loginTitleB")}</span>
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#161613]/60">
          {t("loginText")}
        </p>

        {reset === "1" && (
          <p
            role="status"
            className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          >
            {t("resetDoneNotice")}
          </p>
        )}

        <div
          className={`${reset === "1" ? "mt-4" : "mt-8"} rounded-2xl border border-[#161613]/10 bg-white p-6 sm:p-7`}
        >
          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-sm text-[#161613]/60">
          {t("noAccount")}{" "}
          <Link
            href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-semibold text-[#161613] underline underline-offset-4 hover:opacity-70"
          >
            {t("register")}
          </Link>
        </p>
        <p className="mt-3 text-center text-sm">
          <Link
            href="/hilfe/kontakt"
            className="font-medium text-[#161613]/65 underline underline-offset-4 hover:text-[#161613]"
          >
            {t("loginHelp")}
          </Link>
        </p>
      </div>
    </main>
  );
}
