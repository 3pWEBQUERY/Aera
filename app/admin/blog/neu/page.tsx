import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { BlogEditor } from "@/components/admin/blog-editor";
import { blogLocaleOptions, blogUrlBase } from "@/lib/blog-admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.blog");
  return { title: t("new") };
}

/**
 * Ein leerer Beitrag.
 *
 * Angelegt wird er erst beim ersten Speichern — nicht beim Oeffnen dieser
 * Seite. Sonst haette der Blog nach einer Woche ein Dutzend leerer Entwuerfe
 * von Leuten, die nur einmal geschaut haben, wie der Editor aussieht.
 */
export default async function NewBlogPostPage() {
  await requirePlatformAdmin();
  const locale = await getLocale();

  return (
    <BlogEditor
      post={{
        id: null,
        locale,
        slug: "",
        title: "",
        excerpt: "",
        bodyHtml: "",
        coverUrl: "",
        coverAlt: "",
        category: "",
        status: "DRAFT",
        publishedAt: "",
        isFeatured: false,
        seoTitle: "",
        seoDescription: "",
        noindex: false,
      }}
      locales={blogLocaleOptions()}
      blogUrl={blogUrlBase()}
    />
  );
}
