import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NewsletterUnsubscribeForm } from "@/components/newsletter/unsubscribe-form";
import { getNewsletterUnsubscribeContext } from "@/lib/marketing-consent";

export default async function NewsletterUnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("unsubscribe");
  const context = await getNewsletterUnsubscribeContext(token);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          {t("title")}
        </h1>
        {context ? (
          <>
            <p className="mb-6 mt-3 text-sm leading-6 text-slate-600">
              {t("description", { community: context.tenantName })}
            </p>
            <NewsletterUnsubscribeForm token={token} />
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("invalid")}</p>
        )}
        <Link href="/" className="mt-8 inline-block text-sm text-slate-500 underline underline-offset-4">
          {t("home")}
        </Link>
      </section>
    </main>
  );
}
