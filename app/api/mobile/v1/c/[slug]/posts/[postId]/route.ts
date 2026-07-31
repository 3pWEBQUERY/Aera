import prisma from "@/lib/prisma";
import { canAccess } from "@/lib/entitlements";
import { readPostPoll } from "@/lib/polls";
import { jsonError, jsonOk, mobileAuth, resolveTenant } from "@/lib/mobile/api";
import {
  buildViewerContext,
  commentTree,
  postDtos,
  POST_INCLUDE,
} from "@/lib/mobile/serializers";

// GET /api/mobile/v1/c/{slug}/posts/{postId}
//   → { post, comments, related, popular }
// Kommentare verschachtelt; gated Post → Felder serverseitig genullt + locked.
// `related`/`popular` sind die beiden Reihen, die im Web unter den
// Kommentaren stehen: die neuesten anderen Beitraege des Space und die mit
// den meisten Likes. Bewusst nicht gegeneinander entdoppelt — in einem jungen
// Space waere die zweite Reihe sonst immer leer.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> },
) {
  const { slug, postId } = await params;
  const user = await mobileAuth(req);
  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId: tenant.id },
    include: { ...POST_INCLUDE, space: true },
  });
  if (!post) return jsonError("not_found", "Post not found.", 404);

  const { ctx } = await buildViewerContext(tenant, user);
  if (!canAccess(post.space, ctx)) {
    const isActiveMember = ctx.membership?.status === "ACTIVE";
    return jsonError(
      isActiveMember ? "payment_required" : "not_member",
      "You do not have access to this space.",
      403,
    );
  }
  // Geplante/unveröffentlichte Beiträge sieht vor Go-live nur Staff.
  if (!ctx.isStaff && (!post.isPublished || post.publishedAt.getTime() > Date.now())) {
    return jsonError("not_found", "Post not found.", 404);
  }

  const [dto] = await postDtos(
    tenant.id,
    [post],
    { slug: post.space.slug, type: post.space.type },
    ctx,
    user?.id ?? null,
  );

  const siblingWhere = {
    tenantId: tenant.id,
    spaceId: post.spaceId,
    id: { not: post.id },
    isPublished: true,
    publishedAt: { lte: new Date() },
  } as const;

  const [comments, poll, relatedRows, popularRows] = await Promise.all([
    commentTree(tenant.id, post.id, user?.id ?? null),
    // Die Umfrage kostet eigene Abfragen — hier ist sie es wert, in Listen
    // nicht.
    readPostPoll(tenant.id, post.id, user?.id ?? null),
    prisma.post.findMany({
      where: siblingWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: POST_INCLUDE,
    }),
    prisma.post.findMany({
      where: siblingWhere,
      orderBy: [{ reactions: { _count: "desc" } }, { createdAt: "desc" }],
      take: 8,
      include: POST_INCLUDE,
    }),
  ]);

  const space = { slug: post.space.slug, type: post.space.type };
  const [related, popularAll] = await Promise.all([
    postDtos(tenant.id, relatedRows, space, ctx, user?.id ?? null),
    postDtos(tenant.id, popularRows, space, ctx, user?.id ?? null),
  ]);
  // Ohne Likes ist „beliebt" eine leere Behauptung — dann faellt die Reihe weg.
  const popular = popularAll.filter((p) => p.likeCount > 0);

  return jsonOk({ post: { ...dto, poll }, comments, related, popular });
}
