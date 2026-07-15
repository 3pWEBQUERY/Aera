import { z } from "zod";
import prisma from "@/lib/prisma";
import { buildAccessContext, canAccess } from "@/lib/entitlements";
import { awardPoints } from "@/lib/gamification";
import { notify } from "@/lib/notifications";
import { jsonError, jsonOk, parseJsonBody, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";

// POST /api/mobile/v1/c/{slug}/reactions/toggle  { postId } → { liked, likeCount }
// Logik gespiegelt aus toggleReactionAction (app/actions/engage.ts) inkl.
// Anti-Farming (Like/Unlike-Zyklen minten keine Punkte) + Benachrichtigung.

const schema = z.object({ postId: z.string().min(1) });

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

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;
  const postId = parsed.data.postId;

  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId: tenant.id },
    include: { space: true },
  });
  if (!post) return jsonError("not_found", "Post not found.", 404);
  const ctx = await buildAccessContext(tenant.id, user.id);
  if (!canAccess(post.space, ctx)) {
    return jsonError("not_member", "You do not have access to this space.", 403);
  }

  const existing = await prisma.reaction.findFirst({
    where: { tenantId: tenant.id, postId, userId: user.id, type: "LIKE" },
  });
  let liked: boolean;
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    liked = false;
  } else {
    await prisma.reaction.create({
      data: { tenantId: tenant.id, postId, userId: user.id, type: "LIKE" },
    });
    liked = true;
    const alreadyAwarded = await prisma.pointsLedger.findFirst({
      where: {
        tenantId: tenant.id,
        userId: user.id,
        refType: "Post",
        refId: postId,
        rule: { trigger: "REACTION_GIVEN" },
      },
    });
    if (!alreadyAwarded) {
      await awardPoints({
        tenantId: tenant.id,
        userId: user.id,
        trigger: "REACTION_GIVEN",
        refType: "Post",
        refId: postId,
      });
    }
    await notify({
      tenantId: tenant.id,
      userId: post.authorId,
      actorId: user.id,
      type: "REACTION",
      message: `${user.name} gefällt dein Beitrag.`,
      href: `/c/${slug}/s/${post.space.slug}/${postId}`,
      refType: "Post",
      refId: postId,
    });
  }

  const likeCount = await prisma.reaction.count({
    where: { tenantId: tenant.id, postId, type: "LIKE" },
  });
  return jsonOk({ liked, likeCount });
}
