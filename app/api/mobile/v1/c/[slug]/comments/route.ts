import { z } from "zod";
import prisma from "@/lib/prisma";
import { buildAccessContext, canAccess } from "@/lib/entitlements";
import { awardPoints } from "@/lib/gamification";
import { moderateContent } from "@/lib/moderation";
import { notify } from "@/lib/notifications";
import { jsonError, jsonOk, parseJsonBody, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import { singleCommentDto } from "@/lib/mobile/serializers";

// POST /api/mobile/v1/c/{slug}/comments  { postId, body, parentId? } → { comment }
// Logik gespiegelt aus createCommentAction (app/actions/engage.ts) inkl.
// Benachrichtigungen an Beitragsautor und Elternkommentar-Autor.

const schema = z.object({
  postId: z.string().min(1),
  body: z.string().min(1).max(4000),
  parentId: z.string().optional(),
});

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

  const post = await prisma.post.findFirst({
    where: { id: parsed.data.postId, tenantId: tenant.id },
  });
  if (!post) return jsonError("not_found", "Post not found.", 404);

  // Autorisierung immer gegen den Space, in dem der Post wirklich liegt.
  const space = await prisma.space.findFirst({
    where: { id: post.spaceId, tenantId: tenant.id },
  });
  if (!space) return jsonError("not_found", "Space not found.", 404);
  const ctx = await buildAccessContext(tenant.id, user.id);
  if (!canAccess(space, ctx)) {
    return jsonError("not_member", "You do not have access to this space.", 403);
  }

  const parentId = parsed.data.parentId?.trim() || null;
  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, postId: post.id, tenantId: tenant.id },
    });
    if (!parent) return jsonError("validation", "Parent comment not found.", 400);
  }

  const comment = await prisma.comment.create({
    data: {
      tenantId: tenant.id,
      postId: post.id,
      authorId: user.id,
      body: parsed.data.body,
      parentId,
    },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  await awardPoints({
    tenantId: tenant.id,
    userId: user.id,
    trigger: "COMMENT_CREATED",
    refType: "Post",
    refId: post.id,
  });
  if (!ctx.isStaff) {
    await moderateContent({
      tenantId: tenant.id,
      refType: "Comment",
      refId: comment.id,
      authorId: user.id,
      text: parsed.data.body,
    });
  }

  const postHref = `/c/${slug}/s/${space.slug}/${post.id}`;
  await notify({
    tenantId: tenant.id,
    userId: post.authorId,
    actorId: user.id,
    type: "POST_COMMENT",
    message: `${user.name} hat deinen Beitrag kommentiert.`,
    href: postHref,
    refType: "Comment",
    refId: comment.id,
  });
  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, tenantId: tenant.id },
      select: { authorId: true },
    });
    if (parent && parent.authorId !== post.authorId) {
      await notify({
        tenantId: tenant.id,
        userId: parent.authorId,
        actorId: user.id,
        type: "COMMENT_REPLY",
        message: `${user.name} hat auf deinen Kommentar geantwortet.`,
        href: postHref,
        refType: "Comment",
        refId: comment.id,
      });
    }
  }

  return jsonOk({ comment: await singleCommentDto(tenant.id, comment) });
}
