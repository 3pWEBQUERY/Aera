import { z } from "zod";
import prisma from "@/lib/prisma";
import { buildAccessContext, canAccess } from "@/lib/entitlements";
import { castPollVote, readPostPoll, POLL_MAX_OPTIONS } from "@/lib/polls";
import { jsonError, jsonOk, parseJsonBody, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";

// POST /api/mobile/v1/c/{slug}/posts/{postId}/poll  { options: number[] }
//   → { poll }
// Abstimmen an der Umfrage eines Beitrags. Eine erneute Stimme ersetzt die
// alte (castPollVote loescht vorher), bei Einfachauswahl zaehlt nur die erste
// Option — dieselbe Regel wie im Web (app/actions/engage.ts).
// Mitgliedschaft vorausgesetzt, wie beim Kommentieren.

const schema = z.object({
  options: z.array(z.number().int().min(0).max(POLL_MAX_OPTIONS - 1)).max(POLL_MAX_OPTIONS),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> },
) {
  const { slug, postId } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;

  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId: tenant.id },
    include: { space: true },
  });
  if (!post) return jsonError("not_found", "Post not found.", 404);

  const ctx = await buildAccessContext(tenant.id, user.id);
  if (!canAccess(post.space, ctx)) {
    return jsonError("not_member", "You do not have access to this space.", 403);
  }
  if (ctx.membership?.status !== "ACTIVE" && !ctx.isStaff) {
    return jsonError("not_member", "Active membership required to vote.", 403);
  }

  await castPollVote(tenant.id, postId, user.id, parsed.data.options);
  const poll = await readPostPoll(tenant.id, postId, user.id);
  if (!poll) return jsonError("not_found", "This post has no poll.", 404);
  return jsonOk({ poll });
}
