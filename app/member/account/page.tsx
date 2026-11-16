import Link from "next/link";
import { safeRelativePath } from "@/lib/safe-redirect";
import { TicketThreads } from "@/components/support/ticket-threads";
import { listUserTickets, userUnreadCount, markReadForUser } from "@/lib/support";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Avatar, Pill } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { excerpt, formatDate, formatPrice, timeAgo } from "@/lib/utils";
import {
  MemberProfileForm,
  MemberPasswordForm,
} from "@/components/community/member-settings";
import { TotpSettings } from "@/components/community/totp-settings";
import { ResendVerificationButton } from "@/components/verify-email-banner";
import { countRecoveryCodes } from "@/lib/totp-recovery";
import { PushSettings } from "@/components/push-settings";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getTranslations, getLocale } from "next-intl/server";
import { env, features } from "@/lib/env";
import { DataPrivacySettings } from "@/components/community/data-privacy-settings";
import { setNewsletterConsentAction } from "@/app/actions/newsletter";
import { AERA_INK_VARS } from "@/lib/ui-theme";
import { MembershipActions } from "@/components/community/membership-actions";
import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("metaTitle"), robots: NOINDEX };
}

const intervalKey: Record<string, string> = {
  FREE: "intervalFREE",
  MONTH: "intervalMONTH",
  YEAR: "intervalYEAR",
  ONE_TIME: "intervalONE_TIME",
};

const orderStatusCls: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  REFUNDED: "bg-[#161613]/5 text-[#161613]/60",
  FAILED: "bg-red-100 text-red-700",
};
const orderStatusKey: Record<string, string> = {
  PAID: "statusPaid",
  PENDING: "statusPending",
  REFUNDED: "statusRefunded",
  FAILED: "statusFailed",
};

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/65">
        {eyebrow}
      </p>
      <h2 className="display-serif mt-1 text-2xl text-[#161613]">{title}</h2>
    </div>
  );
}

function safeFrom(from?: string): string {
  return safeRelativePath(from, "/home");
}

/**
 * Global member account — memberships, purchases, invoices and activity
 * across every community, plus profile settings. Rendered as a full-screen
 * overlay; the close button returns to where the member came from.
 */
export default async function MemberAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; recovery?: string; left?: string }>;
}) {
  const { tab, from, recovery, left } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/member/account")}`);
  const tLang = await getTranslations("language");
  const t = await getTranslations("account");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale);

  const activeTab =
    tab === "einstellungen" ? "einstellungen" : tab === "support" ? "support" : "konto";

  // Erst lesen, dann quittieren: sonst waere beim ersten Rendern schon nichts
  // mehr als neu markiert und man saehe nie, was dazugekommen ist.
  const tickets = activeTab === "support" && user ? await listUserTickets(user.id) : [];
  const supportUnread = user ? await userUnreadCount(user.id) : 0;
  if (activeTab === "support" && user) await markReadForUser(user.id);
  const backHref = safeFrom(from);
  // „Zurück zu {Community}“ statt eines namenlosen „Schließen“: das Ziel ist
  // die Seite, von der man kam.
  const backSlug = /^\/c\/([^/?#]+)/.exec(backHref)?.[1] ?? null;
  const [backTenant, leftTenant] = await Promise.all([
    backSlug
      ? prisma.tenant.findUnique({ where: { slug: backSlug }, select: { name: true } })
      : Promise.resolve(null),
    left
      ? prisma.tenant.findUnique({ where: { slug: left }, select: { name: true } })
      : Promise.resolve(null),
  ]);
  const backLabel = backTenant
    ? t("backTo", { name: backTenant.name })
    : backHref === "/home"
      ? t("backToDiscover")
      : t("back");
  const withParams = (t?: string) =>
    `/member/account?${new URLSearchParams({
      ...(t ? { tab: t } : {}),
      ...(from ? { from } : {}),
    }).toString()}`.replace(/\?$/, "");

  const [
    memberships,
    subscriptions,
    stats,
    orders,
    comments,
    chatMessages,
    ownTenants,
    staffCount,
    newsletterConsents,
    emailSuppressions,
  ] =
    await Promise.all([
      prisma.membership.findMany({
        where: { userId: user!.id, status: "ACTIVE" },
        orderBy: { joinedAt: "desc" },
        include: {
          tenant: { select: { name: true, slug: true, logoUrl: true, primaryColor: true } },
          tier: true,
        },
      }),
      prisma.subscription.findMany({
        where: { userId: user!.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      }),
      prisma.memberStats.findMany({ where: { userId: user!.id } }),
      prisma.order.findMany({
        where: { userId: user!.id },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          product: { select: { name: true, downloadUrl: true } },
          tenant: { select: { name: true, slug: true } },
        },
      }),
      prisma.comment.findMany({
        where: { authorId: user!.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          post: { select: { id: true, title: true, body: true, space: { select: { slug: true } } } },
          tenant: { select: { name: true, slug: true } },
        },
      }),
      prisma.chatMessage.findMany({
        where: { userId: user!.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          space: { select: { slug: true, name: true } },
          tenant: { select: { name: true, slug: true } },
        },
      }),
      prisma.tenant.count({
        where: {
          ownerId: user!.id,
          status: "ACTIVE",
          memberships: {
            some: { userId: user!.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      }),
      prisma.membership.count({
        where: {
          userId: user!.id,
          status: "ACTIVE",
          role: { in: ["OWNER", "ADMIN", "MODERATOR"] },
          tenant: { status: "ACTIVE" },
        },
      }),
      prisma.newsletterConsent.findMany({
        where: { userId: user!.id },
        select: { tenantId: true, email: true, status: true },
      }),
      prisma.emailSuppression.findMany({
        where: { userId: user!.id, liftedAt: null },
        select: { tenantId: true, reason: true },
      }),
    ]);

  const isCreator = ownTenants > 0 || staffCount > 0;
  const subByTenant = new Map(subscriptions.map((s) => [s.tenantId, s]));
  const statsByTenant = new Map(stats.map((s) => [s.tenantId, s]));
  const newsletterByTenant = new Map(newsletterConsents.map((c) => [c.tenantId, c]));
  const suppressedTenants = new Set(
    emailSuppressions
      .filter((s) => s.reason !== "UNSUBSCRIBED")
      .map((s) => s.tenantId),
  );
  const purchases = orders.filter((o) => o.status === "PAID" && o.productId);
  // Avatar uploads run through a community — use the first one the member is in.
  const uploadSlug = memberships[0]?.tenant.slug ?? null;

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#f4f1ea] text-[#161613]"
      style={AERA_INK_VARS}
    >
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-[#161613]/10 bg-[#f4f1ea]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
          <span className="display-serif text-2xl leading-none">{t("topbar")}</span>
          <Link
            href={backHref}
            aria-label={backLabel}
            title={backLabel}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#161613]/15 text-[#161613]/70 transition hover:border-[#161613]/40 hover:text-[#161613]"
          >
            <Icon name="close" size={18} />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24 pt-10">
        {/* Kopf */}
        <div className="flex items-center gap-4">
          <Avatar name={user!.name} src={user!.avatarUrl} size={64} />
          <div className="min-w-0">
            <h1 className="display-serif text-3xl leading-tight sm:text-4xl">
              {user!.name}
            </h1>
            <p className="mt-1 text-sm text-[#161613]/65">{user!.email}</p>
            {!user!.emailVerifiedAt && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                  {t("emailUnverified")}
                </span>
                <ResendVerificationButton email={user!.email} />
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <nav
          aria-label={t("tabsAria")}
          className="mt-8 flex items-center gap-2 border-b border-[#161613]/10 pb-4"
        >
          {[
            { key: "konto", label: t("tabAccount"), href: withParams(), badge: 0 },
            { key: "einstellungen", label: t("tabSettings"), href: withParams("einstellungen"), badge: 0 },
            { key: "support", label: t("tabSupport"), href: withParams("support"), badge: supportUnread },
          ].map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={activeTab === tab.key ? "page" : undefined}
              className={
                activeTab === tab.key
                  ? "inline-flex min-h-10 items-center rounded-xl bg-[var(--action)] px-5 text-sm font-semibold text-[var(--action-fg)]"
                  : "inline-flex min-h-10 items-center rounded-xl border border-[#161613]/15 px-5 text-sm font-semibold text-[#161613]/60 transition hover:border-[#161613]/40 hover:text-[#161613]"
              }
            >
              {tab.label}
              {tab.badge > 0 && (
                <span
                  className={
                    activeTab === tab.key
                      ? "ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#161613]"
                      : "ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--action-strong)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--action-fg)]"
                  }
                >
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {activeTab === "support" ? (
          <div className="mt-10">
            <SectionHead eyebrow={t("supportEyebrow")} title={t("supportTitle")} />
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#161613]/60">
              {t("supportText")}
            </p>
            <div className="mt-6">
              <TicketThreads
                tickets={tickets}
                side="user"
                emptyCta={{ href: "/hilfe/kontakt", label: t("supportCta") }}
              />
            </div>
          </div>
        ) : activeTab === "einstellungen" ? (
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-[#161613]/10 bg-white p-6">
              <SectionHead eyebrow={t("profileEyebrow")} title={t("profileTitle")} />
              <p className="mt-2 text-sm leading-6 text-[#161613]/60">
                {t("profileText")}
              </p>
              <div className="mt-6">
                <MemberProfileForm
                  slug={uploadSlug}
                  path={backHref}
                  user={{ name: user!.name, avatarUrl: user!.avatarUrl }}
                />
                {!uploadSlug && (
                  <p className="mt-3 text-xs text-[#161613]/65">{t("joinFirst")}</p>
                )}
              </div>
            </section>
            <section className="flex flex-col rounded-2xl border border-[#161613]/10 bg-white p-6">
              <SectionHead eyebrow={t("securityEyebrow")} title={t("passwordTitle")} />
              <p className="mt-2 text-sm leading-6 text-[#161613]/60">
                {t("passwordText")}
              </p>
              <div className="mt-6 flex flex-1 flex-col">
                <MemberPasswordForm />
              </div>
            </section>
            <section id="zwei-faktor" className="rounded-2xl border border-[#161613]/10 bg-white p-6">
              <SectionHead
                eyebrow={t("securityEyebrow")}
                title={t("twoFaTitle")}
              />
              <div className="mt-4">
                <TotpSettings
                  enabled={Boolean(user.totpEnabledAt)}
                  email={user.email}
                  recoveryCodesLeft={user.totpEnabledAt ? await countRecoveryCodes(user.id) : 0}
                  usedRecoveryCode={recovery === "1"}
                />
              </div>
            </section>
            {features.push && (
              <section className="flex flex-col rounded-2xl border border-[#161613]/10 bg-white p-6">
                <SectionHead
                  eyebrow={t("notifEyebrow")}
                  title={t("pushTitle")}
                />
                <div className="mt-4 flex flex-1 flex-col">
                  <PushSettings vapidPublicKey={env.VAPID_PUBLIC_KEY} />
                </div>
              </section>
            )}
            {/* Volle Breite: die Sprachkarten brauchen den ganzen Content-Bereich. */}
            <section className="rounded-2xl border border-[#161613]/10 bg-white p-6 md:col-span-2">
              <SectionHead eyebrow={tLang("eyebrow")} title={tLang("title")} />
              <div className="mt-4">
                <LocaleSwitcher />
              </div>
            </section>
            <section className="rounded-2xl border border-[#161613]/10 bg-white p-6 md:col-span-2">
              <SectionHead eyebrow={t("privacyEyebrow")} title={t("privacyTitle")} />
              <p className="mt-2 text-sm leading-6 text-[#161613]/60">
                {t("privacyText")}
              </p>
              <div className="mt-5">
                <DataPrivacySettings
                  email={user.email}
                  labels={{
                    exportButton: t("privacyExportButton"),
                    deleteButton: t("privacyDeleteButton"),
                    deleteHint: t("privacyDeleteHint"),
                    confirmationLabel: t("privacyConfirmationLabel"),
                    passwordLabel: t("currentPassword"),
                    deleting: t("privacyDeleting"),
                    failed: t("privacyDeleteFailed"),
                    blockedOwned: t("privacyDeleteBlockedOwned"),
                    blockedPending: t("privacyDeleteBlockedPending"),
                    invalidPassword: t("privacyDeleteInvalidPassword"),
                  }}
                />
              </div>
            </section>
          </div>
        ) : (
          <>
            {/* Mitgliedschaften */}
            <section className="mt-10">
              <SectionHead eyebrow={t("membershipsEyebrow")} title={t("membershipsTitle")} />
              {leftTenant && !memberships.some((m) => m.tenant.slug === left) && (
                <p
                  role="status"
                  className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                >
                  {t("leftNotice", { name: leftTenant.name })}
                </p>
              )}
              {memberships.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-[#161613]/20 px-5 py-8 text-center text-sm text-[#161613]/65">
                  {t.rich("noMemberships", {
                    link: (chunks) => (
                      <Link href="/home" className="font-semibold underline underline-offset-4">
                        {chunks}
                      </Link>
                    ),
                  })}
                </p>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {memberships.map((m) => {
                    const sub = subByTenant.get(m.tenantId);
                    const st = statsByTenant.get(m.tenantId);
                    const newsletter = newsletterByTenant.get(m.tenantId);
                    const newsletterActive =
                      newsletter?.status === "OPTED_IN" &&
                      newsletter.email.trim().toLowerCase() === user!.email.trim().toLowerCase();
                    const newsletterSuppressed = suppressedTenants.has(m.tenantId);
                    return (
                      <div
                        key={m.id}
                        className="rounded-2xl border border-[#161613]/10 bg-white p-5"
                      >
                        <div className="flex items-center gap-3">
                          {m.tenant.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.tenant.logoUrl}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-xl object-cover"
                            />
                          ) : (
                            <span
                              className="display-serif flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg text-white"
                              style={{ backgroundColor: m.tenant.primaryColor }}
                            >
                              {m.tenant.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="display-serif truncate text-lg leading-tight">
                              {m.tenant.name}
                            </p>
                            <p className="mt-0.5 text-xs text-[#161613]/65">
                              {m.tier ? m.tier.name : t("memberFallback")}
                              {m.tier && m.tier.priceCents > 0 &&
                                ` · ${formatPrice(m.tier.priceCents, m.tier.currency, locale)} ${t(intervalKey[m.tier.interval] ?? "intervalFREE")}`}
                              {` · ${t("sinceDate", { date: formatDate(m.joinedAt, locale) })}`}
                            </p>
                          </div>
                          {st && st.points > 0 && (
                            <span className="shrink-0 rounded-full bg-[#161613]/5 px-2.5 py-1 text-xs font-semibold text-[#161613]/70">
                              {nf.format(st.points)} {t("pts")}
                            </span>
                          )}
                        </div>
                        {sub && (
                          <p className="mt-3 text-xs text-[#161613]/65">
                            {t("subActive")}
                            {sub.currentPeriodEnd &&
                              ` · ${t("subRenews", { date: formatDate(sub.currentPeriodEnd, locale) })}`}
                            {sub.cancelAtPeriodEnd && ` · ${t("subEndsPeriod")}`}
                          </p>
                        )}
                        <div className="mt-4 rounded-xl bg-[#161613]/[0.035] p-3">
                          <p className="text-xs font-semibold text-[#161613]/75">
                            {t("newsletterTitle")}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#161613]/65">
                            {newsletterSuppressed
                              ? t("newsletterSuppressed")
                              : newsletterActive
                                ? t("newsletterActive")
                                : t("newsletterInactive")}
                          </p>
                          {!newsletterSuppressed && <form action={setNewsletterConsentAction} className="mt-2">
                            <input type="hidden" name="tenantId" value={m.tenantId} />
                            <input
                              type="hidden"
                              name="intent"
                              value={newsletterActive ? "withdraw" : "opt-in"}
                            />
                            <button
                              type="submit"
                              className="text-xs font-semibold text-[#161613] underline underline-offset-4"
                            >
                              {newsletterActive
                                ? t("newsletterWithdraw")
                                : t("newsletterOptIn")}
                            </button>
                          </form>}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            href={`/c/${m.tenant.slug}`}
                            className="inline-flex min-h-9 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-fg)] transition-colors hover:bg-[var(--primary-hover)]"
                          >
                            {t("toCommunity")}
                          </Link>
                          <Link
                            href={`/c/${m.tenant.slug}/join`}
                            className="inline-flex min-h-9 items-center rounded-xl border border-[#161613]/20 px-4 text-sm font-semibold text-[#161613]/80 transition hover:border-[#161613]/50 hover:text-[#161613]"
                          >
                            {t("switchTier")}
                          </Link>
                          <MembershipActions
                            slug={m.tenant.slug}
                            communityName={m.tenant.name}
                            role={m.role}
                            isPaid={Boolean(m.tier && m.tier.priceCents > 0)}
                            cancelAtPeriodEnd={Boolean(sub?.cancelAtPeriodEnd)}
                            currentPeriodEnd={sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Creator */}
            <section className="mt-8 flex flex-col justify-between rounded-2xl bg-[#161613] p-6 text-white sm:flex-row sm:items-center sm:gap-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/45">
                  {isCreator ? t("creatorEyebrow") : t("creatorEyebrowBecome")}
                </p>
                <h2 className="display-serif mt-1 text-2xl">
                  {isCreator ? t("creatorTitleActive") : t("creatorTitleBecome")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  {isCreator ? t("creatorTextActive") : t("creatorTextBecome")}
                </p>
              </div>
              <Link
                href={isCreator ? "/dashboard" : "/start"}
                className="mt-5 inline-flex min-h-10 w-fit shrink-0 items-center rounded-xl bg-white px-5 text-sm font-semibold text-[#161613] transition-colors hover:bg-[#ece7dc] sm:mt-0"
              >
                {isCreator ? t("creatorCtaActive") : t("creatorCtaBecome")}
              </Link>
            </section>

            {/* Gekaufte Inhalte */}
            <section className="mt-12">
              <SectionHead eyebrow={t("purchasesEyebrow")} title={t("purchasesTitle")} />
              {purchases.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-[#161613]/20 px-5 py-8 text-center text-sm text-[#161613]/65">
                  {t("noPurchases")}
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {purchases.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-[#161613]/10 bg-white p-5"
                    >
                      <div className="min-w-0">
                        <p className="display-serif truncate text-lg">
                          {o.product?.name ?? o.description}
                        </p>
                        <p className="mt-1 text-xs text-[#161613]/65">
                          {o.tenant.name} · {formatDate(o.createdAt, locale)} ·{" "}
                          {formatPrice(o.amountCents, o.currency, locale)}
                        </p>
                      </div>
                      {o.product?.downloadUrl && (
                        <a
                          href={o.product.downloadUrl}
                          className="inline-flex min-h-9 shrink-0 items-center rounded-xl border border-[#161613]/20 px-4 text-sm font-semibold text-[#161613]/80 transition hover:border-[#161613]/50 hover:text-[#161613]"
                        >
                          {t("download")}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Rechnungen */}
            <section className="mt-12">
              <SectionHead eyebrow={t("invoicesEyebrow")} title={t("invoicesTitle")} />
              {orders.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-[#161613]/20 px-5 py-8 text-center text-sm text-[#161613]/65">
                  {t("noInvoices")}
                </p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-[#161613]/10 bg-white">
                  <ul className="divide-y divide-[#161613]/10">
                    {orders.map((o) => {
                      const cls = orderStatusCls[o.status] ?? orderStatusCls.PENDING;
                      const statusLabel = t(orderStatusKey[o.status] ?? "statusPending");
                      return (
                        <li key={o.id} className="flex items-center gap-4 px-5 py-3.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{o.description}</p>
                            <p className="mt-0.5 text-xs text-[#161613]/65">
                              {o.tenant.name} · {formatDate(o.createdAt, locale)}
                            </p>
                          </div>
                          <Pill className={cls}>{statusLabel}</Pill>
                          <span className="display-serif w-24 shrink-0 text-right text-lg">
                            {formatPrice(o.amountCents, o.currency, locale)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>

            {/* Aktivität */}
            <div className="mt-12 grid gap-10 lg:grid-cols-2">
              <section>
                <SectionHead eyebrow={t("activityEyebrow")} title={t("commentsTitle")} />
                {comments.length === 0 ? (
                  <p className="mt-4 text-sm text-[#161613]/65">{t("noComments")}</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {comments.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/c/${c.tenant.slug}/s/${c.post.space.slug}/${c.post.id}`}
                          className="block rounded-2xl border border-[#161613]/10 bg-white p-4 transition hover:border-[#161613]/30"
                        >
                          <p className="text-sm leading-6 text-[#161613]/80">
                            „{excerpt(c.body, 120)}“
                          </p>
                          <p className="mt-2 text-xs text-[#161613]/65">
                            {c.tenant.name} ·{" "}
                            {t("commentOn", {
                              title: c.post.title || excerpt(c.post.body, 40) || t("postFallback"),
                            })}{" "}
                            · {timeAgo(c.createdAt, locale)}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <SectionHead eyebrow={t("activityEyebrow")} title={t("chatTitle")} />
                {chatMessages.length === 0 ? (
                  <p className="mt-4 text-sm text-[#161613]/65">{t("noMessages")}</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {chatMessages.map((m) => {
                      const href = m.space
                        ? `/c/${m.tenant.slug}/s/${m.space.slug}`
                        : null;
                      const body = (
                        <>
                          <p className="text-sm leading-6 text-[#161613]/80">
                            „{excerpt(m.body, 120)}“
                          </p>
                          <p className="mt-2 text-xs text-[#161613]/65">
                            {m.tenant.name} ·{" "}
                            {m.space ? t("inSpace", { name: m.space.name }) : t("directMessage")} ·{" "}
                            {timeAgo(m.createdAt, locale)}
                          </p>
                        </>
                      );
                      return (
                        <li key={m.id}>
                          {href ? (
                            <Link
                              href={href}
                              className="block rounded-2xl border border-[#161613]/10 bg-white p-4 transition hover:border-[#161613]/30"
                            >
                              {body}
                            </Link>
                          ) : (
                            <div className="rounded-2xl border border-[#161613]/10 bg-white p-4">
                              {body}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
