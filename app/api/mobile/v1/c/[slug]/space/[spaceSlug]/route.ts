import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canAccess } from "@/lib/entitlements";
import { isAnnouncementsOnly } from "@/lib/space-settings";
import { cursorPagination, jsonError, jsonOk, mobileAuth, resolveTenant } from "@/lib/mobile/api";
import { buildSpaceContent, buildViewerContext, toSpaceSummary } from "@/lib/mobile/serializers";

// GET /api/mobile/v1/c/{slug}/space/{spaceSlug}?q=&tab=&cursor=&page=
// → { space: SpaceSummary & { description, settings }, content: Content }
// 403 not_member / payment_required wenn nicht zugänglich — `space` wird für
// die Paywall-UI trotzdem mitgeliefert.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; spaceSlug: string }> },
) {
  const { slug, spaceSlug } = await params;
  const user = await mobileAuth(req);
  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, slug: spaceSlug, isArchived: false },
  });
  // Banner-Container und ADS haben keine öffentliche Seite (wie im Web).
  if (!space || space.type === "ADS" || isAnnouncementsOnly(space.settings)) {
    return jsonError("not_found", "Space not found.", 404);
  }

  const { ctx } = await buildViewerContext(tenant, user);
  const spaceDto = {
    ...toSpaceSummary(space, ctx),
    description: space.description,
    settings: space.settings ?? null,
  };

  if (!canAccess(space, ctx)) {
    const isActiveMember = ctx.membership?.status === "ACTIVE";
    const code = isActiveMember ? "payment_required" : "not_member";
    return NextResponse.json(
      {
        error: {
          code,
          message: isActiveMember
            ? "This space requires a paid tier or purchase."
            : "This space is for members only.",
        },
        space: spaceDto,
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(req.url);
  const { limit, cursor } = cursorPagination(req);
  const content = await buildSpaceContent({
    tenant,
    space,
    ctx,
    user,
    q: url.searchParams.get("q") ?? "",
    tab: url.searchParams.get("tab"),
    cursor,
    page: Math.max(1, Number(url.searchParams.get("page")) || 1),
    limit,
  });

  return jsonOk({ space: spaceDto, content });
}
