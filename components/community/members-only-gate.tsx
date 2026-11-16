import { getLocale, getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/dashboard/icons";
import { joinOfferFor, type JoinGate } from "@/lib/join-offer";
import { formatPrice } from "@/lib/utils";

/**
 * Einheitliche Sperrseite für alles, was nur Mitglieder sehen: geteilte
 * Beiträge, Mitgliederliste, Bestenliste, Bibliothek. Sie sagt, was es
 * braucht (kostenlose oder bestimmte Mitgliedschaft mit Preis) und führt mit
 * `next` genau hierher zurück — nach dem Beitritt wie nach der Anmeldung.
 *
 * Verrät nichts vom gesperrten Inhalt: Überschrift und Kontext kommen vom
 * Aufrufer, der entscheidet, was öffentlich sein darf.
 */
export async function MembersOnlyGate({
  slug,
  tenantId,
  communityName,
  title,
  context,
  next,
  loggedIn,
  isMember = false,
  gate = null,
}: {
  slug: string;
  tenantId: string;
  communityName: string;
  /** Überschrift, z. B. „Dieser Beitrag ist nur für Mitglieder“. */
  title: string;
  /** Optionale öffentliche Zeile darüber, z. B. der Space-Name. */
  context?: string | null;
  /** Rücksprungziel innerhalb der Community. */
  next: string;
  loggedIn: boolean;
  /** Bereits Mitglied, aber ohne die nötige Mitgliedschaft (Upgrade-Fall). */
  isMember?: boolean;
  /** Was der Inhalt verlangt; null = eine Mitgliedschaft genügt. */
  gate?: JoinGate | null;
}) {
  const [t, locale, offer] = await Promise.all([
    getTranslations("community.gate"),
    getLocale(),
    joinOfferFor(tenantId, gate),
  ]);
  const tJoin = await getTranslations("community.joinPage");

  const joinHref = (tierId?: string) => {
    const qs = new URLSearchParams({
      ...(tierId ? { tier: tierId } : {}),
      next,
    }).toString();
    return `/c/${slug}/join?${qs}${tierId ? `#tier-${tierId}` : ""}`;
  };
  const loginHref = `/login?next=${encodeURIComponent(next)}`;

  const price =
    offer.kind === "tier"
      ? `${formatPrice(offer.priceCents, offer.currency, locale)}${
          offer.interval === "MONTH"
            ? tJoin("perMonth")
            : offer.interval === "YEAR"
              ? tJoin("perYear")
              : ""
        }`
      : null;

  const text =
    offer.kind === "free"
      ? t("freeText", { name: communityName })
      : offer.kind === "tier"
        ? t("tierText", { name: communityName, tier: offer.tierName, price: price! })
        : t("noneText", { name: communityName });

  return (
    <div className="mx-auto max-w-md py-12 text-center sm:py-16">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
        <Icon name="lock" size={24} />
      </span>
      {context && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#161613]/65">
          {context}
        </p>
      )}
      <h1 className="display-serif mt-1 text-2xl text-[#161613] sm:text-3xl">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#161613]/70">{text}</p>
      <div className="mt-6 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:items-center">
        {offer.kind === "free" && !isMember ? (
          <ButtonLink href={joinHref()} variant="primary" size="lg" className="rounded-xl">
            {t("joinFree")}
          </ButtonLink>
        ) : offer.kind === "tier" ? (
          <ButtonLink href={joinHref(offer.tierId)} variant="primary" size="lg" className="rounded-xl">
            {isMember ? t("upgradeTo", { tier: offer.tierName }) : t("joinTier", { tier: offer.tierName })}
          </ButtonLink>
        ) : (
          <ButtonLink href={joinHref()} variant="primary" size="lg" className="rounded-xl">
            {t("viewMemberships")}
          </ButtonLink>
        )}
        {!loggedIn && (
          <ButtonLink href={loginHref} variant="secondary" size="lg" className="rounded-xl">
            {t("login")}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
