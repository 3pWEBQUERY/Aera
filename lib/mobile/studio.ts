import "server-only";
import type { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { roleAtLeast } from "@/lib/tenant";
import { excerpt } from "@/lib/utils";
import { jsonError, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import type {
  Membership,
  MemberStatus,
  Role,
  SpaceType,
  Tenant,
  User,
} from "@/app/generated/prisma/client";

/**
 * Creator-"Studio"-Bereich der Mobile-API (/api/mobile/v1/studio/**):
 * Bearer-Auth + Membership-Rolle >= ADMIN im Tenant (Moderations-Endpoints
 * mit minRole "MODERATOR", exakt wie die Web-Guards in lib/guards.ts /
 * app/actions/moderation.ts). Alle DTO-Shapes nach
 * Aera-visitor-member-iOS-App/docs/API-CONTRACT.md ("Studio").
 */

export interface StudioContext {
  user: User;
  tenant: Tenant;
  membership: Membership;
  role: Role;
}

/**
 * Bearer-Token → User, Tenant per Slug auflösen (setzt RLS-Kontext) und
 * Membership-Rolle >= minRole verlangen. Spiegelt requireTenantAdmin
 * (lib/guards.ts) für die Mobile-API; statt Redirect kommt 403 "not_authorized".
 */
export async function requireStudioAccess(
  req: Request,
  slug: string,
  minRole: Role = "ADMIN",
): Promise<StudioContext | { response: NextResponse }> {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth;

  const tenant = await resolveTenant(slug);
  if (!tenant) return { response: jsonError("not_found", "Community not found.", 404) };

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: auth.user.id } },
  });
  if (!membership || !roleAtLeast(membership.role, minRole)) {
    return {
      response: jsonError(
        "not_authorized",
        `Studio access requires role ${minRole} or higher.`,
        403,
      ),
    };
  }
  return { user: auth.user, tenant, membership, role: membership.role };
}

// ================================================================ Posts
export interface StudioPostDto {
  id: string;
  title: string | null;
  /** Klartext, serverseitig auf 200 Zeichen gekürzt (lib/utils excerpt). */
  body: string;
  spaceSlug: string;
  spaceName: string;
  spaceType: SpaceType;
  publishedAt: string;
  /** true = wartet auf den Cron (app/api/cron/posts), publishedAt = geplanter Go-live. */
  isScheduled: boolean;
  isPinned: boolean;
  likeCount: number;
  commentCount: number;
}

export interface StudioPostRow {
  id: string;
  title: string | null;
  body: string;
  isPinned: boolean;
  isPublished: boolean;
  publishedAt: Date;
  scheduledAt: Date | null;
  space: { slug: string; name: string; type: SpaceType };
  _count: { comments: number };
}

export const STUDIO_POST_INCLUDE = {
  space: { select: { slug: true, name: true, type: true } },
  _count: { select: { comments: true } },
} as const;

/** Rows → StudioPost-DTOs inkl. gebatchter Like-Zählung (eine Query). */
export async function studioPostDtos(
  tenantId: string,
  rows: StudioPostRow[],
): Promise<StudioPostDto[]> {
  const likeCounts = new Map<string, number>();
  if (rows.length > 0) {
    const groups = await prisma.reaction.groupBy({
      by: ["postId"],
      where: { tenantId, postId: { in: rows.map((p) => p.id) }, type: "LIKE" },
      _count: true,
    });
    for (const g of groups) {
      if (g.postId) likeCounts.set(g.postId, g._count as number);
    }
  }
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    body: excerpt(p.body, 200),
    spaceSlug: p.space.slug,
    spaceName: p.space.name,
    spaceType: p.space.type,
    publishedAt: p.publishedAt.toISOString(),
    isScheduled: !p.isPublished && p.scheduledAt !== null,
    isPinned: p.isPinned,
    likeCount: likeCounts.get(p.id) ?? 0,
    commentCount: p._count.comments,
  }));
}

// ================================================================ Members
export interface StudioMemberDto {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
  status: MemberStatus;
  tierName: string | null;
  points: number;
  joinedAt: string;
}

export interface StudioMemberRow {
  userId: string;
  role: Role;
  status: MemberStatus;
  joinedAt: Date;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  tier: { name: string } | null;
}

export const STUDIO_MEMBER_INCLUDE = {
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
  tier: { select: { name: true } },
} as const;

/** Memberships → StudioMember-DTOs inkl. gebatchter Punkte (MemberStats). */
export async function studioMemberDtos(
  tenantId: string,
  rows: StudioMemberRow[],
): Promise<StudioMemberDto[]> {
  const stats = rows.length
    ? await prisma.memberStats.findMany({
        where: { tenantId, userId: { in: rows.map((m) => m.userId) } },
        select: { userId: true, points: true },
      })
    : [];
  const pointsMap = new Map(stats.map((s) => [s.userId, s.points]));
  return rows.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    status: m.status,
    tierName: m.tier?.name ?? null,
    points: pointsMap.get(m.userId) ?? 0,
    joinedAt: m.joinedAt.toISOString(),
  }));
}

// ================================================================ Requests
/**
 * Shape wie das Community-Request-Objekt (lib/mobile/serializers.ts RequestDto)
 * plus `author.email` für die Verwaltung. `unlock` ist im Studio immer null
 * (Staff kauft nicht), `myVote` ist die eigene Stimme des Staff-Users.
 */
export interface StudioRequestDto {
  id: string;
  title: string;
  body: string;
  status: "OPEN" | "ACCEPTED" | "PRICED" | "FULFILLED" | "DECLINED";
  score: number;
  myVote: "UP" | "DOWN" | null;
  priceCents: number | null;
  unlock: null;
  author: {
    userId: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    role: Role | null;
  };
  createdAt: string;
}

export interface StudioRequestRow {
  id: string;
  title: string;
  body: string;
  status: "OPEN" | "ACCEPTED" | "PRICED" | "FULFILLED" | "DECLINED";
  score: number;
  priceCents: number;
  createdAt: Date;
  requester: { id: string; name: string; email: string; avatarUrl: string | null };
}

export const STUDIO_REQUEST_INCLUDE = {
  requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const;

export async function studioRequestDtos(
  tenantId: string,
  rows: StudioRequestRow[],
  staffUserId: string,
): Promise<StudioRequestDto[]> {
  const ids = rows.map((r) => r.id);
  const [roleRows, myVotes] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId, userId: { in: [...new Set(rows.map((r) => r.requester.id))] } },
      select: { userId: true, role: true },
    }),
    ids.length
      ? prisma.requestVote.findMany({
          where: { tenantId, userId: staffUserId, requestId: { in: ids } },
          select: { requestId: true, value: true },
        })
      : Promise.resolve([]),
  ]);
  const roles = new Map(roleRows.map((r) => [r.userId, r.role]));
  const voteMap = new Map<string, "UP" | "DOWN">(
    myVotes.map((v) => [v.requestId, v.value === 1 ? "UP" : "DOWN"]),
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    status: r.status,
    score: r.score,
    myVote: voteMap.get(r.id) ?? null,
    priceCents: r.priceCents > 0 ? r.priceCents : null,
    unlock: null,
    author: {
      userId: r.requester.id,
      name: r.requester.name,
      email: r.requester.email,
      avatarUrl: r.requester.avatarUrl,
      role: roles.get(r.requester.id) ?? null,
    },
    createdAt: r.createdAt.toISOString(),
  }));
}

// ================================================================ Orders
export interface StudioShippingDetailsDto {
  name: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
}

/**
 * Order.shippingDetails ist das rohe Stripe-`shipping_details`-JSON. Hier
 * werden ausschließlich Name + Adressfelder durchgereicht (kein Telefon,
 * keine sonstigen Stripe-Metadaten).
 */
export function sanitizeShippingDetails(raw: unknown): StudioShippingDetailsDto | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const addrRaw =
    obj.address && typeof obj.address === "object" && !Array.isArray(obj.address)
      ? (obj.address as Record<string, unknown>)
      : null;
  return {
    name: str(obj.name),
    address: addrRaw
      ? {
          line1: str(addrRaw.line1),
          line2: str(addrRaw.line2),
          city: str(addrRaw.city),
          state: str(addrRaw.state),
          postalCode: str(addrRaw.postal_code),
          country: str(addrRaw.country),
        }
      : null,
  };
}

export interface StudioOrderDto {
  id: string;
  description: string;
  productName: string | null;
  customer: { name: string; email: string };
  amountCents: number;
  currency: string;
  status: "PENDING" | "PAID" | "REFUNDED" | "FAILED";
  fulfilled: boolean;
  requiresShipping: boolean;
  shippingDetails: StudioShippingDetailsDto | null;
  createdAt: string;
}
