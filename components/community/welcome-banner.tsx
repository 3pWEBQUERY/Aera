"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";

/**
 * Begrüßung direkt nach dem Beitritt. Die Beitritts-Actions hängen
 * `?welcome=1` an die Zielseite; dieser Hinweis liest es auf jeder Seite der
 * Community, nennt die Mitgliedschaft und schlägt einen ersten Schritt vor.
 * Schließen entfernt den Parameter, damit er beim Neuladen nicht wiederkommt.
 */
export function WelcomeBanner({
  communityName,
  isMember,
  tierName,
  firstStep,
}: {
  communityName: string;
  isMember: boolean;
  /** Name der bezahlten Mitgliedschaft; null bei kostenloser. */
  tierName: string | null;
  firstStep: { href: string; label: string } | null;
}) {
  const t = useTranslations("community.welcome");
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  if (params.get("welcome") !== "1") return null;

  function dismiss() {
    const next = new URLSearchParams(params.toString());
    next.delete("welcome");
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`, { scroll: false });
  }

  return (
    <div className="px-4 pt-4 sm:px-6">
      <div
        role="status"
        className="mx-auto flex max-w-5xl items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900"
      >
        <Icon name="check" size={18} className="mt-0.5 shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1 text-sm leading-6">
          <p className="font-semibold">
            {!isMember
              ? t("pendingTitle", { name: communityName })
              : tierName
                ? t("titleTier", { name: communityName, tier: tierName })
                : t("title", { name: communityName })}
          </p>
          {!isMember ? (
            <p>{t("pendingText")}</p>
          ) : (
            firstStep && (
              <p>
                <Link
                  href={firstStep.href}
                  className="font-semibold underline underline-offset-4 hover:no-underline"
                >
                  {firstStep.label}
                </Link>
              </p>
            )
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dismiss")}
          className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-emerald-800 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
