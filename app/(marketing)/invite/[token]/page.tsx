import Link from "next/link";
import { verifyAccountToken } from "@/lib/tokens";
import { AcceptInviteForm } from "@/components/forms/account-forms";
import { Card, CardBody } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("uiMigration.auth");
  return { title: t("inviteMeta") };
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { token } = await params;
  const { next } = await searchParams;
  const user = await verifyAccountToken(decodeURIComponent(token), "invite");
  const t = await getTranslations("uiMigration.auth");

  if (!user) {
    return (
      <main className="mx-auto flex max-w-md flex-col px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{t("inviteInvalidTitle")}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {t("inviteInvalidText")}
        </p>
        <p className="mt-5 text-sm">
          <Link href="/forgot" className="font-medium text-[color:var(--brand)] hover:underline">
            {t("forgotPassword")}
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col px-5 py-16">
      <h1 className="text-center text-2xl font-bold text-slate-900">
        {t("inviteWelcome")}
      </h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        {t("inviteActivate", { email: user.email })}
      </p>
      <Card className="mt-8">
        <CardBody>
          <AcceptInviteForm
            token={decodeURIComponent(token)}
            defaultName={user.name}
            next={next}
          />
        </CardBody>
      </Card>
    </main>
  );
}
