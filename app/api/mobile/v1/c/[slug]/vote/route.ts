import { z } from "zod";
import prisma from "@/lib/prisma";
import { buildAccessContext, canAccess } from "@/lib/entitlements";
import { awardPoints } from "@/lib/gamification";
import { jsonError, jsonOk, parseJsonBody, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";

// POST /api/mobile/v1/c/{slug}/vote
// { targetType: "post"|"comment", targetId, postId, dir: "UP"|"DOWN" } → { score, myVote }
// Logik gespiegelt aus voteAction (app/actions/engage.ts): dieselbe Richtung
// erneut = Vote entfernen, Gegenrichtung = umdrehen; Anti-Farming bei Punkten.

const schema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.string().min(1),
  postId: z.string().min(1),
  dir: z.enum(["UP", "DOWN"]),
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
  const { targetType, targetId, dir } = parsed.data;

  // Ziel muss zum Tenant gehören; Zugriff gegen den echten Space prüfen.
  const targetSpace =
    targetType === "comment"
      ? (
          await prisma.comment.findFirst({
            where: { id: targetId, tenantId: tenant.id },
            include: { post: { include: { space: true } } },
          })
        )?.post.space
      : (
          await prisma.post.findFirst({
            where: { id: targetId, tenantId: tenant.id },
            include: { space: true },
          })
        )?.space;
  if (!targetSpace) return jsonError("not_found", "Vote target not found.", 404);

  const ctx = await buildAccessContext(tenant.id, user.id);
  if (!canAccess(targetSpace, ctx)) {
    return jsonError("not_member", "You do not have access to this space.", 403);
  }

  const scope =
    targetType === "comment"
      ? { tenantId: tenant.id, userId: user.id, commentId: targetId }
      : { tenantId: tenant.id, userId: user.id, postId: targetId };

  const existing = await prisma.reaction.findMany({
    where: { ...scope, type: { in: ["UP", "DOWN"] } },
  });
  const same = existing.find((r) => r.type === dir);
  if (existing.length) {
    await prisma.reaction.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } });
  }
  let myVote: "UP" | "DOWN" | null = null;
  if (!same) {
    await prisma.reaction.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        type: dir,
        ...(targetType === "comment" ? { commentId: targetId } : { postId: targetId }),
      },
    });
    myVote = dir;
    if (dir === "UP") {
      const alreadyAwarded = await prisma.pointsLedger.findFirst({
        where: {
          tenantId: tenant.id,
          userId: user.id,
          refType: targetType,
          refId: targetId,
          rule: { trigger: "REACTION_GIVEN" },
        },
      });
      if (!alreadyAwarded) {
        await awardPoints({
          tenantId: tenant.id,
          userId: user.id,
          trigger: "REACTION_GIVEN",
          refType: targetType,
          refId: targetId,
        });
      }
    }
  }

  const groups = await prisma.reaction.groupBy({
    by: ["type"],
    where: {
      tenantId: tenant.id,
      type: { in: ["UP", "DOWN"] },
      ...(targetType === "comment" ? { commentId: targetId } : { postId: targetId }),
    },
    _count: true,
  });
  const score = groups.reduce(
    (s, g) => s + (g.type === "UP" ? 1 : -1) * (g._count as number),
    0,
  );
  return jsonOk({ score, myVote });
}
