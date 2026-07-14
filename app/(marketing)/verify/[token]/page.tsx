import Link from "next/link";
import { verifyAccountToken } from "@/lib/tokens";
import { markEmailVerified } from "@/lib/verification";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("uiMigration.auth");
  return { title: t("verifyMeta") };
}

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await verifyAccountToken(decodeURIComponent(token), "verify");
  const t = await getTranslations("uiMigration.auth");

  if (!user) {
    return (
      <main className="mx-auto flex max-w-md flex-col px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{t("invalidLinkTitle")}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {t("verifyInvalidText")}
        </p>
        <p className="mt-5 text-sm">
          <Link href="/login" className="font-medium text-[color:var(--brand)] hover:underline">
            {t("toLogin")}
          </Link>
        </p>
      </main>
    );
  }

  const alreadyVerified = Boolean(user.emailVerifiedAt);
  if (!alreadyVerified) await markEmailVerified(user.id);

  return (
    <main className="mx-auto flex max-w-md flex-col px-5 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">
        {alreadyVerified ? t("alreadyVerifiedTitle") : t("verifiedTitle")}
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        {alreadyVerified
          ? t("alreadyVerifiedText")
          : t("verifiedText", { name: user.name, email: user.email })}
      </p>
      <p className="mt-5 text-sm">
        <Link href="/home" className="font-medium text-[color:var(--brand)] hover:underline">
          {t("continueToAera")}
        </Link>
      </p>
    </main>
  );
}
