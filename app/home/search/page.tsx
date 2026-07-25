import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SearchExperience } from "@/components/home/search-experience";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discover.search");
  return { title: t("metaTitle"), description: t("subtitle") };
}

/**
 * Discovery search. The page itself is a thin shell: results stream in
 * client-side from /api/search so typing feels instant, but `?q=` is honoured
 * on load so a shared link opens with its results.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <SearchExperience initialQuery={(q ?? "").slice(0, 80)} />;
}
