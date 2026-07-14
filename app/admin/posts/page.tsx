import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { excerpt } from "@/lib/utils";
import { PostsManager } from "@/components/admin/posts-manager";
import { AdminPagination } from "@/components/admin/pagination";
import type { Prisma } from "@/app/generated/prisma/client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("posts") };
}

const PAGE_SIZE = 30;

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const t = await getTranslations("admin.posts");
  const { q: qRaw, status: statusRaw, page: pageRaw } = await searchParams;
  const q = (qRaw ?? "").trim().slice(0, 80);
  const status =
    statusRaw === "published" || statusRaw === "unpublished" ? statusRaw : "";
  const page = Math.max(1, Number(pageRaw) || 1);

  const where: Prisma.PostWhereInput = {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status === "published" ? { isPublished: true } : {}),
    ...(status === "unpublished" ? { isPublished: false } : {}),
  };

  const [posts, total, countAll, countPublished, countUnpublished] =
    await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
        include: {
          tenant: { select: { name: true, slug: true } },
          space: { select: { name: true, slug: true, type: true } },
          author: { select: { name: true, email: true } },
          _count: { select: { comments: true, reactions: true } },
        },
      }),
      prisma.post.count({ where }),
      prisma.post.count(),
      prisma.post.count({ where: { isPublished: true } }),
      prisma.post.count({ where: { isPublished: false } }),
    ]);

  const rows = posts.map((p) => ({
    id: p.id,
    title: p.title || excerpt(p.body, 60) || t("untitled"),
    excerpt: excerpt(p.body, 160),
    imageUrl: p.imageUrl,
    hasVideo: !!p.videoUrl,
    isPublished: p.isPublished,
    createdAt: p.createdAt.toISOString(),
    tenantName: p.tenant.name,
    tenantSlug: p.tenant.slug,
    spaceName: p.space.name,
    spaceSlug: p.space.slug,
    spaceType: p.space.type as string,
    authorName: p.author.name,
    authorEmail: p.author.email,
    comments: p._count.comments,
    reactions: p._count.reactions,
  }));

  return (
    <div className="space-y-6">
      <PostsManager
        rows={rows}
        total={total}
        q={q}
        status={status}
        stats={{
          all: countAll,
          published: countPublished,
          unpublished: countUnpublished,
        }}
      />
      <AdminPagination
        basePath="/admin/posts"
        page={page}
        pageCount={Math.ceil(total / PAGE_SIZE)}
        q={q}
        params={{ status }}
      />
    </div>
  );
}
