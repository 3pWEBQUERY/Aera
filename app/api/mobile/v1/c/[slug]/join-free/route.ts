import prisma from "@/lib/prisma";
import { grantEntitlement, revokePreviousTierEntitlement } from "@/lib/entitlements";
import { writeAudit } from "@/lib/audit";
import { emitWebhookEvent } from "@/lib/webhooks";
import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import { buildViewerContext } from "@/lib/mobile/serializers";

// POST /api/mobile/v1/c/{slug}/join-free → { viewer }
// Tritt der Default-/Free-Stufe bei. 409 payment_required wenn kein Free-Tier
// existiert, 403 banned. Logik gespiegelt aus joinCommunityAction
// (app/actions/engage.ts, Free-Pfad).

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

  const existing = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  // Gebannte Mitglieder dürfen sich nicht selbst reaktivieren.
  if (existing?.status === "BANNED") {
    return jsonError("banned", "This account is banned from the community.", 403);
  }

  const tier =
    (await prisma.membershipTier.findFirst({
      where: { tenantId: tenant.id, isDefault: true, interval: "FREE" },
    })) ??
    (await prisma.membershipTier.findFirst({
      where: { tenantId: tenant.id, interval: "FREE", isPublic: true },
      orderBy: { sortOrder: "asc" },
    }));
  if (!tier) {
    return jsonError("payment_required", "This community has no free tier.", 409);
  }

  // Aktive Mitglieder mit derselben Stufe: No-op.
  const alreadyOnTier = existing?.status === "ACTIVE" && existing.tierId === tier.id;
  if (!alreadyOnTier) {
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        role: "MEMBER",
        status: "ACTIVE",
        tierId: tier.id,
      },
      update: { status: "ACTIVE", tierId: tier.id },
    });
    if (existing && existing.tierId !== tier.id) {
      await revokePreviousTierEntitlement({
        tenantId: tenant.id,
        userId: user.id,
        previousTierId: existing.tierId,
        keepKey: tier.entitlementKey,
      });
    }
    await grantEntitlement({
      tenantId: tenant.id,
      userId: user.id,
      key: tier.entitlementKey,
      source: "ROLE",
      sourceId: tier.id,
    });
    await writeAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "member.join",
      metadata: { tier: tier.slug, via: "mobile" },
    });
    if (existing?.status !== "ACTIVE") {
      await emitWebhookEvent(tenant.id, "member.joined", {
        memberName: user.name,
        memberEmail: user.email,
        tier: tier.slug,
        via: "mobile",
      });
    }
  }

  const { viewer } = await buildViewerContext(tenant, user);
  return jsonOk({ viewer });
}
