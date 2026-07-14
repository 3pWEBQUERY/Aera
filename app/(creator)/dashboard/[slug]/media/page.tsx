import { requireTenantAdmin } from "@/lib/guards";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { tenantStorage } from "@/lib/storage-quota";
import {
  MediaLibrary,
  type MediaFolderData,
  type MediaItemData,
} from "@/components/dashboard/media-library";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.media");
  return { title: t("metaTitle") };
}

export default async function MediaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  const storage = await tenantStorage(tenant.id);

  const [folders, objects] = await Promise.all([
    prisma.mediaFolder.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.storageObject.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        key: true,
        purpose: true,
        contentType: true,
        sizeBytes: true,
        visibility: true,
        displayName: true,
        folderId: true,
        createdAt: true,
      },
    }),
  ]);

  const folderData: MediaFolderData[] = folders.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    sortOrder: f.sortOrder,
  }));

  const items: MediaItemData[] = objects.map((o) => ({
    id: o.id,
    url: o.url,
    key: o.key,
    purpose: o.purpose,
    contentType: o.contentType,
    sizeBytes: o.sizeBytes,
    visibility: o.visibility as string,
    displayName: o.displayName,
    folderId: o.folderId,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <MediaLibrary
      slug={slug}
      folders={folderData}
      items={items}
      storage={{ usedBytes: storage.usedBytes, limitBytes: storage.limitBytes }}
    />
  );
}
