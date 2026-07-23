import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { countNewsletterAudience } from "@/lib/newsletter-delivery";
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
      select: { id: true, name: true, description: true, rules: true },
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
  // Empfängerzahlen je Segment (und Gesamtzahl) für die Vorschau im UI.
  const segments: SegmentData[] = await Promise.all(
    segs.map(async (sg) => {
      const rules = (sg.rules && typeof sg.rules === "object" && !Array.isArray(sg.rules)
        ? sg.rules
        : {}) as SegmentData["rules"];
      return {
        id: sg.id,
        name: sg.name,
        description: sg.description,
        rules,
        count: await countNewsletterAudience(tenant.id, rules),
      };
    }),
  );
  const allCount = await countNewsletterAudience(tenant.id, {});

  return (
    <NewsletterManager
      slug={slug}
      tenantName={tenant.name}
      campaigns={campaigns}
      segments={segments}
      tiers={tiers}
      allCount={allCount}
      initialTab={tab}
    />
  );
}
