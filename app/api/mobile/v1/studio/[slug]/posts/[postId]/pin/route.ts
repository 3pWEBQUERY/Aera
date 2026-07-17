import prisma from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";

// POST /api/mobile/v1/studio/{slug}/posts/{postId}/pin → { isPinned }
// Toggle, gespiegelt aus togglePinPostAction (app/actions/dashboard.ts).

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; postId: string }> },
) {
  const { slug, postId } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant } = access;

  const post = await prisma.post.findFirst({
    where: { id: postId, tenantId: tenant.id },
  });
  if (!post) return jsonError("not_found", "Post not found.", 404);

  const updated = await prisma.post.update({
    where: { id: post.id },
    data: { isPinned: !post.isPinned },
  });
  return jsonOk({ isPinned: updated.isPinned });
}
