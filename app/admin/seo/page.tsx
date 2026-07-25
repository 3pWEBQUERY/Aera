import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { systemPrisma } from "@/lib/prisma";
import { PLATFORM_SEO_DEFAULTS, getPlatformSeo } from "@/lib/seo";
import { PlatformSeoManager } from "@/components/admin/seo-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.seo");
  return { title: t("metaTitle") };
}

export default async function AdminSeoPage() {
  await requirePlatformAdmin();

  const [row, effective] = await Promise.all([
    systemPrisma.platformSeo.findUnique({ where: { id: "platform" } }),
    // Was aktuell tatsaechlich ausgeliefert wird (Override oder Standard).
    getPlatformSeo(),
  ]);

  return (
    <PlatformSeoManager
      values={{
        siteName: row?.siteName ?? "",
        title: row?.title ?? "",
        titleTemplate: row?.titleTemplate ?? "",
        description: row?.description ?? "",
        keywords: row?.keywords ?? "",
        imageUrl: row?.imageUrl ?? "",
        twitterHandle: row?.twitterHandle ?? "",
        noindex: row?.noindex ?? false,
      }}
      defaults={PLATFORM_SEO_DEFAULTS}
      effective={effective}
      updatedAt={row?.updatedAt?.toISOString() ?? null}
    />
  );
}
