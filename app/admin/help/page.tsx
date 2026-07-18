import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import {
  HelpManager,
  type HelpCategoryRow,
} from "@/components/admin/help-manager";
import { SUPPORTED_LOCALES, LOCALE_LABELS, normalizeLocale } from "@/i18n/locales";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("help") };
}

export default async function AdminHelpPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const { locale: rawLocale } = await searchParams;
  const locale = normalizeLocale(rawLocale);

  const rows = await prisma.helpCategory.findMany({
    where: { locale },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      articles: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });

  const categories: HelpCategoryRow[] = rows.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    description: c.description,
    articles: c.articles.map((a) => ({
      id: a.id,
      question: a.question,
      answer: a.answer,
      isPublished: a.isPublished,
    })),
  }));

  const locales = SUPPORTED_LOCALES.map((code) => ({ code, label: LOCALE_LABELS[code] }));

  return <HelpManager categories={categories} locale={locale} locales={locales} />;
}
