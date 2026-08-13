import type { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { BlogEditor, BlogEditorSideForms } from "@/components/admin/blog-editor";
import { blogLocaleOptions, blogUrlBase } from "@/lib/blog-admin";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await prisma.platformPost.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: post?.title ?? "Blog" };
}

export default async function EditBlogPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ neu?: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { neu } = await searchParams;

  const post = await prisma.platformPost.findUnique({ where: { id } });
  if (!post) notFound();

  return (
    <>
      <BlogEditor
        post={{
          id: post.id,
          locale: post.locale,
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt ?? "",
          bodyHtml: post.bodyHtml,
          coverUrl: post.coverUrl ?? "",
          coverAlt: post.coverAlt ?? "",
          category: post.category ?? "",
          status: post.status,
          publishedAt: post.publishedAt?.toISOString() ?? "",
          isFeatured: post.isFeatured,
          seoTitle: post.seoTitle ?? "",
          seoDescription: post.seoDescription ?? "",
          noindex: post.noindex,
        }}
        locales={blogLocaleOptions()}
        blogUrl={blogUrlBase()}
        justCreated={neu === "1"}
      />
      {/* Ausserhalb des Editor-Formulars: HTML kennt kein Formular im Formular. */}
      <BlogEditorSideForms id={post.id} />
    </>
  );
}
