import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { MediaManager } from "@/components/admin/media-manager";
import { AdminPagination } from "@/components/admin/pagination";
import type { Prisma } from "@/app/generated/prisma/client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("media") };
}

const PAGE_SIZE = 36;

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const { q: qRaw, type: typeRaw, page: pageRaw } = await searchParams;
  const q = (qRaw ?? "").trim().slice(0, 80);
  const type = typeRaw === "image" || typeRaw === "video" ? typeRaw : "";
  const page = Math.max(1, Number(pageRaw) || 1);

  const where: Prisma.StorageObjectWhereInput = {
    ...(type === "image" ? { contentType: { startsWith: "image/" } } : {}),
    ...(type === "video" ? { contentType: { startsWith: "video/" } } : {}),
    ...(q
      ? {
          OR: [
            { purpose: { contains: q, mode: "insensitive" } },
            { key: { contains: q, mode: "insensitive" } },
            { tenant: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [objects, total, countAll, countImages, countVideos] = await Promise.all([
    prisma.storageObject.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        tenant: { select: { name: true, slug: true } },
        owner: { select: { name: true, email: true } },
      },
    }),
    prisma.storageObject.count({ where }),
    prisma.storageObject.count(),
    prisma.storageObject.count({ where: { contentType: { startsWith: "image/" } } }),
    prisma.storageObject.count({ where: { contentType: { startsWith: "video/" } } }),
  ]);

  const rows = objects.map((o) => ({
    id: o.id,
    url: o.url,
    key: o.key,
    purpose: o.purpose,
    contentType: o.contentType,
    sizeBytes: o.sizeBytes,
    visibility: o.visibility as string,
    createdAt: o.createdAt.toISOString(),
    tenantName: o.tenant.name,
    tenantSlug: o.tenant.slug,
    ownerName: o.owner?.name ?? null,
    ownerEmail: o.owner?.email ?? null,
  }));

  return (
    <div className="space-y-6">
      <MediaManager
        rows={rows}
        total={total}
        q={q}
        type={type}
        stats={{ all: countAll, images: countImages, videos: countVideos }}
      />
      <AdminPagination
        basePath="/admin/media"
        page={page}
        pageCount={Math.ceil(total / PAGE_SIZE)}
        q={q}
        params={{ type }}
      />
    </div>
  );
}
