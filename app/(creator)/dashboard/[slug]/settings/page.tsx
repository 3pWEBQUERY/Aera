import { requireTenantAdmin } from "@/lib/guards";
import { getCommunityCoverUrl } from "@/lib/tenant";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { features, env } from "@/lib/env";
import { revalidatePath } from "next/cache";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { Pill } from "@/components/ui/misc";
import { Input, Label } from "@/components/ui/field";
import { SettingsTabs, type SettingsSection } from "@/components/dashboard/settings-tabs";
import { StripeConnectionTest } from "@/components/dashboard/stripe-test";
import { getConnectStatus, createDashboardLoginLink } from "@/lib/stripe";
import { startStripeConnectAction, disconnectStripeAction } from "@/app/actions/stripe-connect";

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      <Icon name={ok ? "check" : "clock"} size={13} />
      {label}
    </span>
  );
}
import {
  BrandingPanel,
  DomainPanel,
  DangerZone,
} from "@/components/dashboard/settings-panels";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; connect?: string }>;
}) {
  const { slug } = await params;
  const { tab, connect } = await searchParams;
  const { tenant, role } = await requireTenantAdmin(slug);
  const coverUrl = await getCommunityCoverUrl(tenant.id);
  const t = await getTranslations("dashboard.settings");

  // Live Stripe Connect status for the connected account (if any).
  const stripeStatus =
    features.stripe && tenant.stripeAccountId
      ? await getConnectStatus(tenant.stripeAccountId)
      : null;
  const stripeReady = !!stripeStatus?.chargesEnabled;
  const stripeLoginUrl =
    stripeReady && tenant.stripeAccountId
      ? await createDashboardLoginLink(tenant.stripeAccountId)
      : null;

  const integrations: {
    name: string;
    icon: IconName;
    ok: boolean;
    hint: string;
  }[] = [
    { name: t("intStripe"), icon: "payouts", ok: features.stripe, hint: "STRIPE_SECRET_KEY" },
    { name: t("intResend"), icon: "newsletter", ok: features.email, hint: "RESEND_API_KEY" },
    { name: t("intGemini"), icon: "sparkles", ok: features.gemini, hint: "GEMINI_API_KEY" },
    { name: t("intStorage"), icon: "gallery", ok: features.storage, hint: "S3_BUCKET" },
  ];

  const integrationsSection = (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">{t("integrationsHeading")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{t("integrationsDesc")}</p>
      <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {integrations.map((it) => (
          <li key={it.name} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.ok ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"}`}>
              <Icon name={it.icon} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{it.name}</p>
              {!it.ok && <p className="font-mono text-xs text-slate-400">{t("missing", { key: it.hint })}</p>}
            </div>
            {it.ok ? (
              <Pill className="bg-green-100 text-green-700">{t("active")}</Pill>
            ) : (
              <Pill className="bg-slate-100 text-slate-500">{t("inactive")}</Pill>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-slate-400">
        {t("activeNote")}
      </p>
      <StripeConnectionTest slug={slug} />

      <div className="mt-6 border-t border-slate-100 pt-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <p className="font-medium text-slate-900">{t("stripeConnect")}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              {t("stripeConnectDesc", { percent: tenant.platformFeePercent })}
            </p>
          </div>
          {stripeReady ? (
            <Pill className="mt-1 shrink-0 self-start bg-green-100 text-green-700">{t("paymentsActive")}</Pill>
          ) : tenant.stripeAccountId ? (
            <Pill className="mt-1 shrink-0 self-start bg-amber-100 text-amber-700">{t("onboardingOpen")}</Pill>
          ) : (
            <Pill className="mt-1 shrink-0 self-start bg-slate-100 text-slate-500">{t("notConnected")}</Pill>
          )}
        </div>

        {connect === "done" && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {t("connectDone")}
          </p>
        )}
        {connect === "error" && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("connectError")}
          </p>
        )}

        {!features.stripe ? (
          <p className="mt-4 text-sm text-slate-500">
            {t.rich("needsSecretKey", {
              code: (c) => <span className="font-mono text-xs">{c}</span>,
            })}
          </p>
        ) : stripeReady ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <StatusChip ok label={t("chipPayments")} />
              <StatusChip ok={!!stripeStatus?.payoutsEnabled} label={t("chipPayouts")} />
              <StatusChip ok={!!stripeStatus?.detailsSubmitted} label={t("chipDetails")} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {stripeLoginUrl && (
                <a
                  href={stripeLoginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Icon name="external" size={16} />
                  {t("openStripeDashboard")}
                </a>
              )}
              <form action={disconnectStripeAction}>
                <input type="hidden" name="tenant" value={slug} />
                <button className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600">
                  {t("disconnect")}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            {tenant.stripeAccountId && (
              <div className="mb-3 flex flex-wrap gap-2">
                <StatusChip ok={!!stripeStatus?.detailsSubmitted} label={t("chipDetailsSubmitted")} />
                <StatusChip ok={!!stripeStatus?.chargesEnabled} label={t("chipChargesEnabled")} />
              </div>
            )}
            <form action={startStripeConnectAction}>
              <input type="hidden" name="tenant" value={slug} />
              <button className="inline-flex items-center gap-2 rounded-xl bg-[#635BFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5348e0]">
                <Icon name="payouts" size={16} />
                {tenant.stripeAccountId ? t("continueOnboarding") : t("connectWithStripe")}
              </button>
            </form>
            <p className="mt-2 text-xs text-slate-400">
              {t("redirectNote")}
            </p>
          </div>
        )}
      </div>
    </section>
  );

  const sections: SettingsSection[] = [
    {
      id: "branding",
      label: t("tabBranding"),
      icon: "branding",
      content: (
        <BrandingPanel
          slug={slug}
          coverUrl={coverUrl}
          tenant={{
            name: tenant.name,
            tagline: tenant.tagline,
            description: tenant.description,
            logoUrl: tenant.logoUrl,
            primaryColor: tenant.primaryColor,
            accentColor: tenant.accentColor,
            // Cast entfällt nach `npm run db:migrate` (regeneriert den Client).
            category: (tenant as { category?: string | null }).category ?? null,
          }}
        />
      ),
    },
    {
      id: "integrations",
      label: t("tabIntegrations"),
      icon: "settings",
      content: integrationsSection,
    },
    {
      id: "domain",
      label: t("tabDomain"),
      icon: "globe",
      content: (
        <DomainPanel
          slug={slug}
          rootDomain={env.ROOT_DOMAIN}
          subdomain={tenant.subdomain}
        />
      ),
    },
    ...(role === "OWNER"
      ? [
          {
            id: "danger",
            label: t("tabDanger"),
            icon: "alert" as const,
            danger: true,
            content: <DangerZone slug={slug} name={tenant.name} />,
          },
        ]
      : []),
  ];

  return (
    <SettingsTabs
      title={t("title")}
      subtitle={t("subtitle")}
      sections={sections}
      initialTab={tab}
    />
  );
}
