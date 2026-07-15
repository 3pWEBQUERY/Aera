import { z } from "zod";
import prisma from "@/lib/prisma";
import { buildAccessContext, canAccess } from "@/lib/entitlements";
import { awardPoints } from "@/lib/gamification";
import { moderateContent } from "@/lib/moderation";
import { indexContent } from "@/lib/ai";
import { jsonError, jsonOk, parseJsonBody, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import { postDtos, POST_INCLUDE } from "@/lib/mobile/serializers";

// POST /api/mobile/v1/c/{slug}/posts  { spaceSlug, title?, body } → { post }
// Logik gespiegelt aus createPostAction (app/actions/engage.ts): Space-Zugriff,
// Indexierung, Punkte, Auto-Moderation (Staff ausgenommen).

const schema = z.object({
  spaceSlug: z.string().min(1),
  title: z.string().max(140).optional(),
  body: z.string().min(1).max(10000),
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

  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, slug: parsed.data.spaceSlug },
  });
  if (!space) return jsonError("not_found", "Space not found.", 404);

  const ctx = await buildAccessContext(tenant.id, user.id);
  if (!canAccess(space, ctx)) {
    return jsonError("not_member", "You do not have access to this space.", 403);
  }

  const title = parsed.data.title?.trim() || null;
  const body = parsed.data.body;

  const post = await prisma.post.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      authorId: user.id,
      title,
      body,
    },
    include: POST_INCLUDE,
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "POST",
    sourceId: post.id,
    title: title ?? undefined,
    content: body,
  });
  await awardPoints({
    tenantId: tenant.id,
    userId: user.id,
    trigger: "POST_CREATED",
    refType: "Post",
    refId: post.id,
  });
  // Auto-Moderation (Staff ausgenommen) — blockiert das Posten nie.
  if (!ctx.isStaff) {
    await moderateContent({
      tenantId: tenant.id,
      refType: "Post",
      refId: post.id,
      authorId: user.id,
      text: [title, body].filter(Boolean).join("\n"),
    });
  }

  const [dto] = await postDtos(
    tenant.id,
    [post],
    { slug: space.slug, type: space.type },
    ctx,
    user.id,
  );
  return jsonOk({ post: dto });
}
