import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { joinCommunityAction } from "@/app/actions/engage";
import { MemberSignupForm } from "@/components/forms/auth-forms";
import { PurchaseSubmitButton } from "@/components/community/purchase-submit-button";
import { ImmediateAccessConsent } from "@/components/community/immediate-access-consent";
import { Icon } from "@/components/dashboard/icons";
import { cn, formatPrice } from "@/lib/utils";

const INTERVAL_KEY: Record<string, string | null> = {
  FREE: null,
  MONTH: "perMonth",
  YEAR: "perYear",
  ONE_TIME: "oneTime",
};

/** Each non-empty description line is rendered as a benefit bullet. */
function benefitsOf(description: string | null): string[] {
  return (description ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ref, error } = await searchParams;
  const refCode = (ref ?? "").trim().slice(0, 32) || undefined;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, user, ctx } = community;
  const t = await getTranslations("community.joinPage");
  const tSafety = await getTranslations("billingSafety");
  const tLegal = await getTranslations("legalPurchase");
  const locale = await getLocale();
  const currentTierId = ctx.membership?.status === "ACTIVE" ? ctx.membership.tierId : null;

  const [tiers, counts, activeStripeSubscription] = await Promise.all([
    prisma.membershipTier.findMany({
      where: { tenantId: tenant.id, isPublic: true },
      orderBy: [{ priceCents: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.membership.groupBy({
      by: ["tierId"],
      where: { tenantId: tenant.id, status: "ACTIVE", tierId: { not: null } },
      _count: { _all: true },
    }),
    user && currentTierId
      ? prisma.subscription.findFirst({
          where: {
            tenantId: tenant.id,
            userId: user.id,
            stripeSubscriptionId: { not: null },
            status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const countMap = new Map(counts.map((c) => [c.tierId, c._count._all]));

  // Highlight: creator's explicit pick, else the paid tier with most members.
  const isRec = (t: (typeof tiers)[number]) =>
    (t as { isRecommended?: boolean }).isRecommended === true;
  const coverOf = (t: (typeof tiers)[number]) =>
    (t as { coverUrl?: string | null }).coverUrl ?? null;
  const recommended = tiers.find(isRec);
  const popularTier =
    recommended ??
    tiers
      .filter((t) => t.priceCents > 0)
      .sort((a, b) => (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0))[0];
  const popularId =
    recommended?.id ??
    (popularTier && (countMap.get(popularTier.id) ?? 0) > 0 ? popularTier.id : null);
  const highlightLabel = recommended ? t("recommendedBadge") : t("popularBadge");

  const cols =
    tiers.length >= 3 ? "lg:grid-cols-3" : tiers.length === 2 ? "sm:grid-cols-2" : "";

  return (
    <div className="mx-auto max-w-5xl py-4">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="display-serif text-3xl text-[#161613] sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 text-[#161613]/60">
          {t("subtitle", { name: tenant.name })}
        </p>
      </div>

      {error === "active-subscription" && (
        <p
          role="alert"
          className="mx-auto mt-6 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800"
        >
          {tSafety("activeSubscriptionError")}
        </p>
      )}
      {error === "legal-consent" && (
        <p
          role="alert"
          className="mx-auto mt-6 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800"
        >
          {tLegal("requiredError")}
        </p>
      )}

      {/* Neu hier? Konto + Mitgliedschaft in einem Schritt — direkt beim Creator. */}
      {!user && (
        <div className="mx-auto mt-10 max-w-md">
          <div className="rounded-2xl border border-[#161613]/10 bg-white p-6 sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/45">
              {t("newEyebrow", { name: tenant.name })}
            </p>
            <h2 className="display-serif mt-1.5 text-2xl text-[#161613]">
              {t("newTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#161613]/60">
              {t("newText")}
            </p>
            <div className="mt-5">
              <MemberSignupForm
                tenant={slug}
                cta={t("signupCta", { name: tenant.name })}
                refCode={refCode}
              />
            </div>
            <p className="mt-4 text-center text-sm text-[#161613]/60">
              {t("haveAccount")}{" "}
              <a
                href={`/login?next=${encodeURIComponent(`/c/${slug}/join`)}`}
                className="font-semibold text-[#161613] underline underline-offset-4 hover:opacity-70"
              >
                {t("login")}
              </a>
            </p>
          </div>
          <p className="mt-8 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#161613]/40">
            {t("orChoose")}
          </p>
        </div>
      )}

      <div className={cn("mx-auto mt-10 grid max-w-4xl items-stretch gap-5", cols)}>
        {tiers.map((tier) => {
          const isCurrent = currentTierId === tier.id;
          const switchBlocked = Boolean(activeStripeSubscription) && Boolean(currentTierId) && !isCurrent;
          const isPopular = popularId === tier.id && !isCurrent;
          const benefits = benefitsOf(tier.description);
          const memberCount = countMap.get(tier.id) ?? 0;
          const cover = coverOf(tier);
          return (
            <div
              key={tier.id}
              className={cn(
                "relative flex flex-col overflow-hidden rounded-2xl border bg-white",
                isPopular
                  ? "border-[var(--brand)] shadow-lg ring-1 ring-[var(--brand)]"
                  : "border-slate-200 shadow-sm",
              )}
            >
              {/* Highlight banner like the reference design. */}
              {isPopular && (
                <div className="bg-[var(--brand)] px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-white">
                  {highlightLabel}
                </div>
              )}
              {isCurrent && (
                <div className="bg-slate-900 px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-white">
                  {t("currentBadge")}
                </div>
              )}

              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="aspect-[3/1] w-full object-cover" />
              )}

              <div className="flex flex-1 flex-col p-6">
              <h2 className="font-semibold text-slate-900">{tier.name}</h2>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-tight text-slate-900">
                  {tier.priceCents === 0
                    ? t("free")
                    : formatPrice(tier.priceCents, tier.currency, locale)}
                </span>
                {tier.priceCents > 0 && INTERVAL_KEY[tier.interval] && (
                  <span className="text-sm text-slate-500">
                    {t(INTERVAL_KEY[tier.interval]!)}
                  </span>
                )}
              </div>
              {memberCount > 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  {t("memberCount", { count: memberCount })}
                </p>
              )}

              <form action={joinCommunityAction} className="mt-5">
                <input type="hidden" name="tenant" value={slug} />
                <input type="hidden" name="tierId" value={tier.id} />
                {refCode && <input type="hidden" name="ref" value={refCode} />}
                {user && !isCurrent && (
                  <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                    <input
                      name="newsletterOptIn"
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-[var(--brand-ring)]"
                    />
                    <span>{t("newsletterOptInLabel", { name: tenant.name })}</span>
                  </label>
                )}
                {tier.priceCents > 0 && (
                  <ImmediateAccessConsent className="mb-3" />
                )}
                <PurchaseSubmitButton
                  variant={tier.priceCents > 0 ? "primary" : "secondary"}
                  size="md"
                  className="w-full rounded-full"
                  disabled={isCurrent || switchBlocked}
                >
                  {switchBlocked
                    ? tSafety("switchBlocked")
                    : isCurrent
                    ? t("ctaCurrent")
                    : currentTierId
                      ? t("ctaSwitch")
                      : tier.priceCents > 0
                        ? t("ctaJoin")
                        : t("ctaJoinFree")}
                </PurchaseSubmitButton>
              </form>

              {benefits.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <ul className="space-y-2.5">
                    {benefits.slice(0, 6).map((b, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                        <Icon
                          name="check"
                          size={16}
                          className="mt-0.5 shrink-0 text-[var(--brand)]"
                        />
                        {b}
                      </li>
                    ))}
                  </ul>
                  {benefits.length > 6 && (
                    <details className="group mt-2.5">
                      <summary className="cursor-pointer list-none text-sm font-medium text-[color:var(--brand)] hover:underline [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">
                          {t("showMore", { count: benefits.length - 6 })}
                        </span>
                        <span className="hidden group-open:inline">{t("showLess")}</span>
                      </summary>
                      <ul className="mt-2.5 space-y-2.5">
                        {benefits.slice(6).map((b, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                            <Icon
                              name="check"
                              size={16}
                              className="mt-0.5 shrink-0 text-[var(--brand)]"
                            />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              </div>
            </div>
          );
        })}
      </div>

      {tiers.length === 0 && (
        <p className="mt-10 text-center text-sm text-slate-500">
          {t("noTiers")}
        </p>
      )}

      <p className="mt-8 text-center text-xs text-slate-400">
        {t("footnote")}
      </p>
    </div>
  );
}
