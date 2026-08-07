import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import prisma, { systemPrisma, withUserContext } from "./prisma";
import { getCurrentUser } from "./auth";
import { isBlockLive } from "./blocks";
import { parseTheme, resolveTheme, DEFAULT_THEME } from "./themes";
import { parseSocials } from "./socials";
import type { AeliBlock, AeliProfile, Tenant } from "@/app/generated/prisma/client";

/**
 * Die Datenzugriffe rund um ein Profil — an einer Stelle, weil hier die
 * wichtigste Unterscheidung der App liegt:
 *
 *   Studio  → mit Nutzerkontext. Sieht Entwürfe, versteckte und geplante
 *             Blöcke, Statistik.
 *   Seite   → ohne Nutzerkontext. Sieht ausschließlich, was veröffentlicht und
 *             gerade sichtbar ist.
 *
 * Die öffentliche Seite liest bewusst NIE die Sitzung. Ein eingeloggter
 * Besitzer soll auf `marie.aeli.so` exakt das sehen, was alle anderen sehen —
 * die Vorschau seines Entwurfs gehört ins Studio, nicht auf die echte Adresse.
 * Nebenbei bleibt die Seite damit für alle gleich und cachebar.
 */

export type ProfileWithBlocks = AeliProfile & {
  blocks: AeliBlock[];
  linkedTenant: Pick<
    Tenant,
    "id" | "name" | "slug" | "subdomain" | "customDomain" | "logoUrl" | "tagline"
  > | null;
};

const TENANT_SELECT = {
  id: true,
  name: true,
  slug: true,
  subdomain: true,
  customDomain: true,
  logoUrl: true,
  tagline: true,
} as const;

/**
 * Das Profil des angemeldeten Nutzers — oder `null`, wenn es noch keins gibt.
 *
 * Der Besitzerkontext wird hier aufgespannt, nicht irgendwo weiter oben. Nur
 * so sieht die Abfrage auch einen ENTWURF: ohne Kontext greift die öffentliche
 * Policy, und ein frisch angelegtes Profil wäre im eigenen Studio unsichtbar.
 */
export const getOwnProfile = cache(async (): Promise<ProfileWithBlocks | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return withUserContext(user.id, () =>
    prisma.aeliProfile.findUnique({
      where: { userId: user.id },
      include: {
        blocks: { orderBy: { sortOrder: "asc" } },
        linkedTenant: { select: TENANT_SELECT },
      },
    }),
  );
});

/**
 * Für alles hinter der Anmeldung. Wer eingeloggt ist, aber noch keinen Handle
 * hat, landet im Onboarding statt auf einer leeren Seite.
 */
export async function requireProfile(): Promise<ProfileWithBlocks> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?weiter=/studio");
  const profile = await getOwnProfile();
  if (!profile) redirect("/onboarding");
  return profile;
}

export interface PublicProfile {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoImageUrl: string | null;
  seoNoindex: boolean;
  showBranding: boolean;
  gate: AeliProfile["gate"];
  socials: ReturnType<typeof parseSocials>;
  theme: ReturnType<typeof resolveTheme>;
  blocks: AeliBlock[];
  linkedTenant: ProfileWithBlocks["linkedTenant"];
  /** Läuft in der verknüpften Community gerade eine Übertragung? */
  isLive: boolean;
}

/**
 * Die Seite, wie ein Besucher sie sieht.
 *
 * Keine `where`-Klausel auf `status` — das erledigen die RLS-Policies, und zwar
 * für jede Abfrage dieser App gleichzeitig. Ein vergessenes `status` in einer
 * späteren Funktion kann hier also keinen Entwurf ins Netz stellen.
 */
export const getPublicProfile = cache(async (handle: string): Promise<PublicProfile | null> => {
  const normalized = handle.trim().toLowerCase();
  if (!normalized) return null;

  const profile = await prisma.aeliProfile.findUnique({
    where: { handle: normalized },
    include: {
      blocks: { orderBy: { sortOrder: "asc" } },
      linkedTenant: { select: TENANT_SELECT },
    },
  });
  if (!profile) return null;

  const now = new Date();
  const visible = profile.blocks.filter((block) => isBlockLive(block, now));

  // „Meistgeklickt oben“ ordnet nur die Links um. Überschriften, Trenner und
  // Einbettungen bleiben, wo der Creator sie hingestellt hat — sonst zerfällt
  // die Seite beim ersten erfolgreichen Link in Einzelteile.
  const blocks = profile.smartSort ? sortLinksByPopularity(visible) : visible;

  return {
    id: profile.id,
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    bannerUrl: profile.bannerUrl,
    seoTitle: profile.seoTitle,
    seoDescription: profile.seoDescription,
    seoImageUrl: profile.seoImageUrl,
    seoNoindex: profile.seoNoindex,
    showBranding: profile.showBranding,
    gate: profile.gate,
    socials: parseSocials(profile.socials),
    theme: resolveTheme(parseTheme(profile.theme ?? DEFAULT_THEME)),
    blocks,
    linkedTenant: profile.linkedTenant,
    isLive: profile.linkedTenantId ? await tenantIsLive(profile.linkedTenantId) : false,
  };
});

/**
 * Sortiert nur die LINK-Blöcke untereinander um und lässt jede andere Position
 * unangetastet: die Plätze, auf denen Links standen, werden nach Klickzahl neu
 * besetzt.
 */
function sortLinksByPopularity(blocks: AeliBlock[]): AeliBlock[] {
  const linkSlots: number[] = [];
  const links: AeliBlock[] = [];
  blocks.forEach((block, index) => {
    if (block.type === "LINK") {
      linkSlots.push(index);
      links.push(block);
    }
  });
  links.sort((a, b) => b.clickCount - a.clickCount);
  const result = [...blocks];
  linkSlots.forEach((slot, index) => {
    result[slot] = links[index]!;
  });
  return result;
}

/**
 * Der einzige Blick über die Produktgrenze hinweg.
 *
 * `LiveSession` ist eine tenant-scoped Aera-Tabelle; die Rolle `aeli_app` hat
 * dort bewusst keine Rechte. Die Frage ist trotzdem harmlos — „sendet diese
 * eine Community gerade?“ — und wird deshalb über die privilegierte Verbindung
 * gestellt, eng auf die verknüpfte `tenantId` begrenzt und ohne ein einziges
 * Feld aus der Antwort zu übernehmen.
 */
async function tenantIsLive(tenantId: string): Promise<boolean> {
  const running = await systemPrisma.liveSession.findFirst({
    where: { tenantId, status: "LIVE" },
    select: { id: true },
  });
  return Boolean(running);
}

/** Für Skripte und Hintergrundarbeit: Profil im Kontext seines Besitzers laden. */
export function asProfileOwner<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return withUserContext(userId, fn);
}
