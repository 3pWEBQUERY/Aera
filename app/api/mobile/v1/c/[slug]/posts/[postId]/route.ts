import prisma from "@/lib/prisma";
import { canAccess } from "@/lib/entitlements";
import { jsonError, jsonOk, mobileAuth, resolveTenant } from "@/lib/mobile/api";
import {
  buildViewerContext,
  commentTree,
  postDtos,
  POST_INCLUDE,
} from "@/lib/mobile/serializers";

// GET /api/mobile/v1/c/{slug}/posts/{postId} → { post, comments }
// Kommentare verschachtelt; gated Post → Felder serverseitig genullt + locked.

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
  const comments = await commentTree(tenant.id, post.id, user?.id ?? null);
  return jsonOk({ post: dto, comments });
}
