import { requireTenantAdmin } from "@/lib/guards";
import { featureGate } from "@/components/dashboard/feature-gate";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  DevelopersManager,
  type ApiKeyRow,
  type EndpointRow,
} from "@/components/dashboard/developers-manager";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.developers");
  return { title: t("metaTitle") };
}

export default async function DevelopersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug, "OWNER");
  // Paywall: the queries below never run for a package without this feature.
  const locked = await featureGate(tenant.id, slug, "developers");
  if (locked) return locked;
  const t = await getTranslations("dashboard.developers");

  const [keysRaw, endpointsRaw] = await Promise.all([
    prisma.apiKey.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.webhookEndpoint.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        deliveries: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    }),
  ]);

  const keys: ApiKeyRow[] = keysRaw.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  }));

  const endpoints: EndpointRow[] = endpointsRaw.map((ep) => ({
    id: ep.id,
    url: ep.url,
    events: ep.events,
    isActive: ep.isActive,
    deliveries: ep.deliveries.map((d) => ({
      id: d.id,
      event: d.event,
      ok: d.ok,
      responseCode: d.responseCode,
      error: d.error,
      createdAt: d.createdAt.toISOString(),
    })),
  }));

  return (
    <div>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <DevelopersManager
        slug={slug}
        apiUrl={`${env.APP_URL}/api/v1`}
        keys={keys}
        endpoints={endpoints}
      />
    </div>
  );
}
