import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import {
  NewsletterManager,
  type CampaignRowData,
  type SegmentData,
} from "@/components/dashboard/newsletter-manager";

export default async function NewsletterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const { tenant } = await requireTenantAdmin(slug);
  const [rows, segs, tiers] = await Promise.all([
    prisma.newsletterCampaign.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      include: { segment: { select: { name: true } } },
    }),
    prisma.segment.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.membershipTier.findMany({
      where: { tenantId: tenant.id },
      select: { slug: true, name: true },
    }),
  ]);

  const campaigns: CampaignRowData[] = rows.map((c) => ({
    id: c.id,
    subject: c.subject,
    body: c.body,
    status: c.status,
    segmentId: c.segmentId,
    segmentName: c.segment?.name ?? null,
    recipientCount: c.recipientCount,
    sentAt: c.sentAt,
    scheduledAt: c.scheduledAt,
  }));
  const segments: SegmentData[] = segs;

  return (
    <NewsletterManager
      slug={slug}
      campaigns={campaigns}
      segments={segments}
      tiers={tiers}
      initialTab={tab}
    />
  );
}
