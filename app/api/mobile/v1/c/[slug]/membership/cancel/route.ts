import prisma from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";

// POST /api/mobile/v1/c/{slug}/membership/cancel → { ok: true }
// Nur für Abos ohne externes Billing (Dev-Grants / lokal angelegte Abos):
//  - Stripe-Abo   → 409 manage_on_web (Kündigung über die Website).
//  - Apple-Abo    → 409 manage_on_apple (Kündigung über die iOS-Abo-Verwaltung).
// Logik gespiegelt aus cancelOwnMembershipAction (app/actions/subscription.ts,
// Nicht-Stripe-Zweig: sofort beenden, auf Default-Stufe zurückfallen).

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    include: { tier: true },
  });
  if (!membership) return jsonError("not_member", "You are not a member.", 403);
  if (membership.role === "OWNER") {
    return jsonError("validation", "Owners cannot cancel their own membership.", 400);
  }
  if (!membership.tier || membership.tier.priceCents === 0) {
    return jsonError("validation", "There is no paid membership to cancel.", 400);
  }

  const sub = await prisma.subscription.findFirst({
    where: {
      tenantId: tenant.id,
      userId: user.id,
      status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (sub?.stripeSubscriptionId) {
    return jsonError(
      "manage_on_web",
      "This subscription is billed via Stripe — manage it on the website.",
      409,
    );
  }
  if (sub?.appleOriginalTransactionId) {
    return jsonError(
      "manage_on_apple",
      "This subscription is billed via Apple — manage it in the iOS subscription settings.",
      409,
    );
  }

  // Lokales Abo (Dev-Grant): sofort beenden, Default-Stufe, Entitlement weg.
  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "CANCELED", cancelAtPeriodEnd: false },
    });
  }
  await prisma.entitlement.deleteMany({
    where: {
      tenantId: tenant.id,
      userId: user.id,
      key: membership.tier.entitlementKey,
      source: { in: ["TIER", "ROLE"] },
    },
  });
  const defaultTier = await prisma.membershipTier.findFirst({
    where: { tenantId: tenant.id, isDefault: true },
  });
  await prisma.membership.update({
    where: { id: membership.id },
    data: { tierId: defaultTier?.id ?? null },
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "membership.cancel",
    metadata: { tier: membership.tier.slug, via: "mobile" },
  });
  return jsonOk({ ok: true });
}
