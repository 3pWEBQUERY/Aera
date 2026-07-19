import { requireTenantAdmin } from "@/lib/guards";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { env, features } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  AutomationsManager,
  type StepRow,
} from "@/components/dashboard/automations-manager";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.automations");
  return { title: t("metaTitle") };
}

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  const t = await getTranslations("dashboard.automations");

  const rows = await prisma.automationStep.findMany({
    where: { tenantId: tenant.id },
    orderBy: { dayOffset: "asc" },
    include: { _count: { select: { deliveries: true } } },
  });

  const steps: StepRow[] = rows.map((s) => ({
    id: s.id,
    dayOffset: s.dayOffset,
    subject: s.subject,
    body: s.body,
    isActive: s.isActive,
    deliveryCount: s._count.deliveries,
  }));

  const cronReady = env.CRON_SECRET.length >= 32;

  return (
    <div>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />
      {!cronReady && (
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t.rich("cronWarning", {
            code: (chunks) => (
              <code className="rounded bg-white px-1.5 py-0.5 text-xs ring-1 ring-amber-200">{chunks}</code>
            ),
          })}
          {!features.email && ` ${t("cronWarningNoEmail")}`}
        </p>
      )}
      <AutomationsManager slug={slug} steps={steps} />
    </div>
  );
}
