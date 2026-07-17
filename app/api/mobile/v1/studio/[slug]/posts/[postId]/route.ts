import prisma from "@/lib/prisma";
import { removeFromIndex } from "@/lib/ai";
import { jsonError, jsonOk } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";

// DELETE /api/mobile/v1/studio/{slug}/posts/{postId} → { ok }
// Effekte gespiegelt aus deletePostAction (app/actions/dashboard.ts):
// Suchindex-Eintrag entfernen + Post löschen. minRole MODERATOR, weil das
// Web-Dashboard Moderatoren Inhalte entfernen lässt
// (removeFlaggedContentAction, app/actions/moderation.ts).

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> },
) {
  const { slug, postId } = await params;
  const access = await requireStudioAccess(req, slug, "MODERATOR");
  if ("response" in access) return access.response;
  const { tenant } = access;

  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId: tenant.id },
  });
  if (!post) return jsonError("not_found", "Post not found.", 404);

  await removeFromIndex(tenant.id, "POST", post.id);
  await prisma.post.delete({ where: { id: post.id } });
  return jsonOk({ ok: true });
}
