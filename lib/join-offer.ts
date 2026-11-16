import "server-only";
import prisma, { withTenantContext } from "./prisma";
import { isSafeRelativePath } from "./safe-redirect";

/**
 * Was braucht ein Besucher, um an gesperrte Inhalte zu kommen — und was
 * kostet das? Sperrseiten (Beitrag, Mitglieder, Bestenliste, Bibliothek)
 * nennen damit konkret den nächsten Schritt statt nur "gesperrt".
 *
 * - "free": eine kostenlose Mitgliedschaft genügt.
 * - "tier": es braucht eine bestimmte (oder irgendeine bezahlte)
 *   Mitgliedschaft; Name und Preis der günstigsten passenden.
 * - "none": die Community bietet gerade nichts Passendes öffentlich an.
 */
export type JoinOffer =
  | { kind: "free" }
  | {
      kind: "tier";
      tierId: string;
      tierName: string;
      priceCents: number;
      currency: string;
      interval: string;
    }
  | { kind: "none" };

export interface JoinGate {
  visibility: "PUBLIC" | "MEMBERS" | "PAID";
  requiredEntitlementKey?: string | null;
}

export async function joinOfferFor(tenantId: string, gate: JoinGate | null): Promise<JoinOffer> {
  const tiers = await prisma.membershipTier.findMany({
    where: { tenantId, isPublic: true },
    orderBy: [{ priceCents: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      priceCents: true,
      currency: true,
      interval: true,
      entitlementKey: true,
    },
  });
  const toOffer = (t: (typeof tiers)[number]): JoinOffer =>
    t.priceCents > 0
      ? {
          kind: "tier",
          tierId: t.id,
          tierName: t.name,
          priceCents: t.priceCents,
          currency: t.currency,
          interval: t.interval,
        }
      : { kind: "free" };

  if (gate?.requiredEntitlementKey) {
    const match = tiers.find((t) => t.entitlementKey === gate.requiredEntitlementKey);
    return match ? toOffer(match) : { kind: "none" };
  }
  if (gate?.visibility === "PAID") {
    const paid = tiers.find((t) => t.priceCents > 0);
    return paid ? toOffer(paid) : { kind: "none" };
  }
  // Mitglieder-Inhalt: die kostenlose Mitgliedschaft genügt, wenn es sie gibt.
  const free = tiers.find((t) => t.priceCents === 0);
  if (free) return { kind: "free" };
  return tiers[0] ? toOffer(tiers[0]) : { kind: "none" };
}

export interface SignupJoinContext {
  communityName: string;
  tier: { name: string; priceCents: number; currency: string; interval: string } | null;
}

/**
 * Registrierung aus einer Beitrittsseite heraus (`/signup?next=/c/<slug>/join?tier=<id>`):
 * Welche Community und welche Mitgliedschaft hat die Person gewählt? Die
 * Signup-Seite zeigt das als Kontext über dem Formular. Nur öffentliche
 * Angaben (Name, öffentliche Mitgliedschaft mit Preis).
 */
export async function signupJoinContext(next: unknown): Promise<SignupJoinContext | null> {
  if (!isSafeRelativePath(next)) return null;
  let url: URL;
  try {
    url = new URL(next, "https://same-origin.invalid");
  } catch {
    return null;
  }
  const match = /^\/c\/([^/]+)\/join\/?$/.exec(url.pathname);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]!);
  const tenant = await prisma.tenant.findUnique({
    where: { slug, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (!tenant) return null;
  const tierId = url.searchParams.get("tier");
  const tier = tierId
    ? await withTenantContext(tenant.id, () =>
        prisma.membershipTier.findFirst({
          where: { id: tierId, tenantId: tenant.id, isPublic: true },
          select: { name: true, priceCents: true, currency: true, interval: true },
        }),
      )
    : null;
  return { communityName: tenant.name, tier: tier ?? null };
}

/**
 * Rücksprungziel nach dem Beitritt: nur Pfade innerhalb dieser Community,
 * nie die Beitrittsseite selbst (sonst dreht sich der Weg im Kreis).
 */
export function isCommunityReturnPath(value: unknown, slug: string): value is string {
  if (!isSafeRelativePath(value)) return false;
  const base = `/c/${slug}`;
  const path = value.split(/[?#]/)[0]!;
  if (path !== base && !path.startsWith(`${base}/`)) return false;
  return path !== `${base}/join` && !path.startsWith(`${base}/join/`);
}
