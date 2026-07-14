import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/forms/account-forms";
import { Card, CardBody } from "@/components/ui/card";

export async function generateMetadata() {
  const t = await getTranslations("uiMigration.auth");
  return { title: t("forgotMeta") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("authPages");
  return (
    <main className="mx-auto flex max-w-md flex-col px-5 py-16">
      <h1 className="text-center text-2xl font-bold text-slate-900">
        {t("forgotTitle")}
      </h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        {t("forgotText")}
      </p>
      <Card className="mt-8">
        <CardBody>
          <ForgotPasswordForm />
        </CardBody>
      </Card>
      <p className="mt-5 text-center text-sm text-slate-500">
        {t("backTo")}{" "}
        <Link href="/login" className="font-medium text-[color:var(--brand)] hover:underline">
          {t("backToLogin")}
        </Link>
      </p>
    </main>
  );
}
