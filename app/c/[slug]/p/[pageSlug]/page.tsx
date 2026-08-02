import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { getCommunityCoverUrl } from "@/lib/tenant";
import { parseLayout } from "@/lib/layout";
import { readPreviewOverride } from "@/lib/preview";
import { buildCommunityHeroData } from "@/lib/community-hero";
import { getCommunityPage, listPageNav } from "@/lib/community-page-queries";
import { CommunityHero } from "@/components/community/community-hero";
import { CommunityPageTabs } from "@/components/community/page-tabs";
import { CommunityPageBlocks } from "@/components/community/page-blocks";

/**
 * Eine frei gebaute Seite einer Community.
 *
 * Traegt denselben Kopfbereich wie die Startseite und dieselbe Reiterleiste:
 * Wer auf "Ueber" klickt, wechselt den Inhalt, nicht den Ort. Das ist der
 * Unterschied zwischen einer Unterseite und einem Absprung.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; pageSlug: string }>;
}): Promise<Metadata> {
  const { slug, pageSlug } = await params;
  const community = await getCommunityContext(slug);
  if (!community) return {};
  const page = await getCommunityPage(community.tenant.id, pageSlug, community.ctx);
  if (!page) return {};
  return {
    title: `${page.title} · ${community.tenant.name}`,
    description: page.description ?? undefined,
    // Entwuerfe sieht nur Staff — sie gehoeren in keinen Suchindex.
    robots: page.isDraft ? { index: false, follow: false } : undefined,
  };
}

export default async function CommunityCustomPage({
  params,
}: {
  params: Promise<{ slug: string; pageSlug: string }>;
}) {
  const { slug, pageSlug } = await params;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, ctx } = community;

  const page = await getCommunityPage(tenant.id, pageSlug, ctx);
  if (!page) notFound();

  const t = await getTranslations("community.pages");
  const isMember = ctx.membership?.status === "ACTIVE";

  const [coverUrl, memberCount, postCount, cheapestPaidTier, tipsSpace, navPages, preview] =
    await Promise.all([
      getCommunityCoverUrl(tenant.id),
      prisma.membership.count({ where: { tenantId: tenant.id, status: "ACTIVE" } }),
      prisma.post.count({ where: { tenantId: tenant.id, isPublished: true } }),
      prisma.membershipTier.findFirst({
        where: { tenantId: tenant.id, priceCents: { gt: 0 } },
        orderBy: { priceCents: "asc" },
        select: { priceCents: true, currency: true, interval: true },
      }),
      prisma.space.findFirst({
        where: { tenantId: tenant.id, type: "TIPS", isArchived: false },
        select: { slug: true },
      }),
      listPageNav(tenant.id, ctx),
      readPreviewOverride(slug, ctx.isStaff),
    ]);

  const layout = preview
    ? preview.config
    : parseLayout((tenant as unknown as { layout?: unknown }).layout ?? null);

  const heroData = await buildCommunityHeroData({
    slug,
    tenant,
    layout,
    preview,
    coverUrl,
    memberCount,
    postCount,
    cheapestPaidTier,
    tipsHref: tipsSpace ? `/c/${slug}/s/${tipsSpace.slug}` : null,
    isMember,
    isStaff: ctx.isStaff,
  });

  return (
    <div>
      <CommunityHero variant={layout.header.variant} data={heroData} />
      <CommunityPageTabs slug={slug} pages={navPages} activeSlug={page.slug} />

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {page.isDraft && (
          <p className="mb-8 rounded-2xl border border-amber-300/60 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-800">
            {t("draftNotice")}
          </p>
        )}
        <h1 className="display-serif mb-8 text-3xl text-[#161613] sm:text-4xl">{page.title}</h1>
        <CommunityPageBlocks blocks={page.blocks} />
      </div>
    </div>
  );
}
