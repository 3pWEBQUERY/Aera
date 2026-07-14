import { getTranslations } from "next-intl/server";
import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { getOrCreateWallet, walletBalance } from "@/lib/credits";
import { features } from "@/lib/env";
import {
  MediaStudio,
  type LibraryImage,
} from "@/components/dashboard/media-studio";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.mediaStudio");
  return { title: t("metaTitle") };
}

export default async function MediaStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ image?: string }>;
}) {
  const { slug } = await params;
  const { image } = await searchParams;
  const { tenant } = await requireTenantAdmin(slug);

  // Deep link from the media library: preload this image as the working image.
  const initial = image
    ? await prisma.storageObject.findFirst({
        where: {
          id: image,
          tenantId: tenant.id,
          contentType: { startsWith: "image/" },
        },
        select: { url: true },
      })
    : null;

  const [objects, wallet] = await Promise.all([
    prisma.storageObject.findMany({
      where: { tenantId: tenant.id, contentType: { startsWith: "image/" } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        url: true,
        key: true,
        contentType: true,
        displayName: true,
      },
    }),
    getOrCreateWallet(tenant.id),
  ]);

  const library: LibraryImage[] = objects.map((o) => ({
    id: o.id,
    url: o.url,
    name: o.displayName ?? (o.key.split("/").pop() || "image"),
    contentType: o.contentType ?? "image/png",
  }));

  return (
    <MediaStudio
      slug={slug}
      library={library}
      initialBalance={walletBalance(wallet)}
      aiEnabled={features.gemini}
      initialImageUrl={initial?.url ?? null}
    />
  );
}
