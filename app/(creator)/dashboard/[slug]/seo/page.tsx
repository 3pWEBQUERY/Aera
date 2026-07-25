import { getTranslations } from "next-intl/server";
import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { resolveTenantSeo, TENANT_SEO_SELECT } from "@/lib/seo";
import { SeoManager } from "@/components/dashboard/seo-manager";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.seo");
  return { title: t("metaTitle") };
}

export default async function SeoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);

  const row = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenant.id },
    select: TENANT_SEO_SELECT,
  });

  // Dieselbe Funktion, die auch die ausgelieferten Meta-Tags baut — die
  // Vorschau kann dadurch nicht von der Realitaet abweichen.
  const effective = resolveTenantSeo({ ...row, seoTitle: null, seoDescription: null, seoKeywords: null, seoImageUrl: null });

  return (
    <SeoManager
      slug={slug}
      communityName={row.name}
      values={{
        seoTitle: row.seoTitle ?? "",
        seoDescription: row.seoDescription ?? "",
        seoKeywords: row.seoKeywords ?? "",
        seoImageUrl: row.seoImageUrl ?? "",
        seoNoindex: row.seoNoindex,
      }}
      derived={{
        title: effective.title,
        description: effective.description,
        keywords: effective.keywords.join(", "),
        imageUrl: effective.imageUrl,
        url: effective.url,
      }}
    />
  );
}
