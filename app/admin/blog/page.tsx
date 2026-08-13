import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { BlogManager, type BlogRow } from "@/components/admin/blog-manager";
import { AdminPagination } from "@/components/admin/pagination";
import { isBlogCategory, isScheduled } from "@/lib/blog";
import type { Prisma } from "@/app/generated/prisma/client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("blog") };
}

const PAGE_SIZE = 20;

/**
 * Alle Beitraege des Aera-Blogs.
 *
 * Die vier Reiter sind nicht vier Status, sondern drei — „geplant" ist ein
 * veroeffentlichter Beitrag mit einem Datum in der Zukunft. Genau deshalb
 * braucht er einen eigenen Reiter: sonst stuende er unter „veroeffentlicht",
 * waere aber nirgends zu sehen, und niemand wuesste warum.
 */
export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const t = await getTranslations("admin.blog");
  const { q: qRaw, status: statusRaw, page: pageRaw } = await searchParams;

  const q = (qRaw ?? "").trim().slice(0, 80);
  const status =
    statusRaw === "published" || statusRaw === "draft" || statusRaw === "scheduled"
      ? statusRaw
      : "";
  const page = Math.max(1, Number(pageRaw) || 1);
  const now = new Date();

  const published: Prisma.PlatformPostWhereInput = {
    status: "PUBLISHED",
    publishedAt: { not: null, lte: now },
  };
  const scheduled: Prisma.PlatformPostWhereInput = {
    status: "PUBLISHED",
    publishedAt: { gt: now },
  };
  const draft: Prisma.PlatformPostWhereInput = { status: "DRAFT" };

  const where: Prisma.PlatformPostWhereInput = {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { excerpt: { contains: q, mode: "insensitive" } },
            { bodyHtml: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status === "published" ? published : {}),
    ...(status === "scheduled" ? scheduled : {}),
    ...(status === "draft" ? draft : {}),
  };

  const [posts, total, countAll, countPublished, countScheduled, countDraft] =
    await Promise.all([
      prisma.platformPost.findMany({
        where,
        // Neueste zuerst — und Beitraege ohne Datum (Entwuerfe) nach ihrem
        // letzten Bearbeitungsstand, damit der Entwurf von eben oben steht.
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
        include: { author: { select: { name: true } } },
      }),
      prisma.platformPost.count({ where }),
      prisma.platformPost.count(),
      prisma.platformPost.count({ where: published }),
      prisma.platformPost.count({ where: scheduled }),
      prisma.platformPost.count({ where: draft }),
    ]);

  const rows: BlogRow[] = posts.map((post) => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? "",
    coverUrl: post.coverUrl,
    locale: post.locale,
    category: post.category,
    categoryLabel: isBlogCategory(post.category) ? t(`categories.${post.category}`) : null,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    scheduled: isScheduled(post, now),
    isFeatured: post.isFeatured,
    readingMinutes: post.readingMinutes,
    authorName: post.author?.name ?? null,
    updatedAt: post.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <BlogManager
        rows={rows}
        total={total}
        q={q}
        status={status}
        stats={{
          all: countAll,
          published: countPublished,
          scheduled: countScheduled,
          draft: countDraft,
        }}
      />
      <AdminPagination
        basePath="/admin/blog"
        page={page}
        pageCount={Math.ceil(total / PAGE_SIZE)}
        q={q}
        params={{ status }}
      />
    </div>
  );
}
