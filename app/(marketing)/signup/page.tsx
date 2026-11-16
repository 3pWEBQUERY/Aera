import Link from "next/link";
import { safeRelativePath } from "@/lib/safe-redirect";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "@/components/forms/auth-forms";
import logoBkButton from "@/public/logo_bk_button.svg";
import { AERA_INK_VARS } from "@/lib/ui-theme";
import { signupJoinContext } from "@/lib/join-offer";
import { formatPrice } from "@/lib/utils";
import { getLocale } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("ui.auth");
  return { title: t("signupMeta") };
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const user = await getCurrentUser();
  const safeNext = safeRelativePath(next, "/home");
  if (user) redirect(safeNext);
  const t = await getTranslations("authPages");

  const creatorIntent = next === "/start" || next?.startsWith("/start?");
  // Aus einer Beitrittsseite gekommen: Community und gewählte Mitgliedschaft
  // stehen über dem Formular, damit die Wahl sichtbar bleibt.
  const joinContext = creatorIntent ? null : await signupJoinContext(next);
  const tJoin = await getTranslations("community.joinPage");
  const locale = await getLocale();
  const joinPrice = (tier: NonNullable<NonNullable<typeof joinContext>["tier"]>) =>
    tier.priceCents > 0
      ? `${formatPrice(tier.priceCents, tier.currency, locale)}${
          tier.interval === "MONTH" ? tJoin("perMonth") : tier.interval === "YEAR" ? tJoin("perYear") : ""
        }`
      : tJoin("free");

  return (
    <main
      className="min-h-screen bg-[#f4f1ea] text-[#161613]"
      style={AERA_INK_VARS}
    >
      <div className="mx-auto flex max-w-md flex-col px-5 pb-24 pt-16 md:pt-20">
        <Link href="/" className="mx-auto mb-8 block w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25">
          <Image
            src={logoBkButton}
            alt="Aera"
            priority
            className="h-14 w-14"
          />
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/65">
          {creatorIntent ? t("signupCreatorEyebrow") : t("signupEyebrow")}
        </p>
        <h1 className="display-serif mt-3 text-4xl leading-[1.05] sm:text-5xl">
          {creatorIntent ? (
            <>
              {t("signupCreatorTitleA")}
              <br />
              <span className="text-[#161613]/65">{t("signupCreatorTitleB")}</span>
            </>
          ) : (
            <>
              {t("signupTitleA")}
              <br />
              <span className="text-[#161613]/65">{t("signupTitleB")}</span>
            </>
          )}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#161613]/60">
          {creatorIntent ? t("signupCreatorText") : t("signupText")}
        </p>

        {joinContext && (
          <p className="mt-6 rounded-2xl border border-[#161613]/10 bg-white px-4 py-3 text-sm font-medium text-[#161613]">
            {joinContext.tier
              ? t("signupJoinContextTier", {
                  name: joinContext.communityName,
                  tier: joinContext.tier.name,
                  price: joinPrice(joinContext.tier),
                })
              : t("signupJoinContext", { name: joinContext.communityName })}
          </p>
        )}

        <div className={joinContext ? "mt-4 rounded-2xl border border-[#161613]/10 bg-white p-6 sm:p-7" : "mt-8 rounded-2xl border border-[#161613]/10 bg-white p-6 sm:p-7"}>
          <SignupForm next={next} />
        </div>

        <p className="mt-6 text-center text-sm text-[#161613]/60">
          {t("alreadyRegistered")}{" "}
          <Link
            href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-semibold text-[#161613] underline underline-offset-4 hover:opacity-70"
          >
            {t("loginLink")}
          </Link>
        </p>
        {!creatorIntent && (
          <p className="mt-2 text-center text-sm text-[#161613]/60">
            {t("wantCreator")}{" "}
            <Link
              href="/signup?next=/start"
              className="font-semibold text-[#161613] underline underline-offset-4 hover:opacity-70"
            >
              {t("startAsCreator")}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
