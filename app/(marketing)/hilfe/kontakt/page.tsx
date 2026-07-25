import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { Icon } from "@/components/dashboard/icons";
import { ContactForm } from "@/components/support/contact-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help.contact");
  return { title: t("metaTitle"), description: t("intro") };
}

export default async function ContactPage() {
  const user = await getCurrentUser();
  const t = await getTranslations("help.contact");

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-14 sm:py-20">
      <Link
        href="/hilfe"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#161613]/55 transition hover:text-[#161613]"
      >
        <Icon name="chevron" size={15} className="rotate-90" />
        {t("back")}
      </Link>

      <h1 className="display-serif mt-6 text-4xl leading-tight sm:text-5xl">{t("title")}</h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#161613]/65">{t("intro")}</p>

      <div className="mt-8">
        <ContactForm
          signedIn={Boolean(user)}
          accountHref="/member/account?tab=support&from=/hilfe"
        />
      </div>
    </main>
  );
}
