import Link from "next/link";
import { verifyAccountToken } from "@/lib/tokens";
import { ResetPasswordForm } from "@/components/forms/account-forms";
import { Card, CardBody } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("uiMigration.auth");
  return { title: t("resetMeta") };
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await verifyAccountToken(decodeURIComponent(token), "reset");
  const t = await getTranslations("uiMigration.auth");

  if (!user) {
    return (
      <main className="mx-auto flex max-w-md flex-col px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{t("invalidLinkTitle")}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {t("resetInvalidText")}
        </p>
        <p className="mt-5 text-sm">
          <Link href="/forgot" className="font-medium text-[color:var(--brand)] hover:underline">
            {t("requestNewLink")}
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col px-5 py-16">
      <h1 className="text-center text-2xl font-bold text-slate-900">
        {t("resetTitle")}
      </h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        {t("forAccount", { email: user.email })}
      </p>
      <Card className="mt-8">
        <CardBody>
          <ResetPasswordForm token={decodeURIComponent(token)} />
        </CardBody>
      </Card>
    </main>
  );
}
