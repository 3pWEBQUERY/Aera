import prisma from "@/lib/prisma";
import { canAccess } from "@/lib/entitlements";
import { excerpt } from "@/lib/utils";
import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import {
  buildViewerContext,
  courseDtos,
  eventDtos,
  postDtos,
  productDtos,
  POST_INCLUDE,
  type PostDto,
} from "@/lib/mobile/serializers";

// GET /api/mobile/v1/c/{slug}/search?q=
// → { posts, courses, events, products, knowledge } — je max. 10, nur Inhalte
// aus Spaces, auf die der Viewer Zugriff hat.

const MAX = 10;
const POST_SPACE_TYPES = ["FEED", "FORUM", "BLOG", "VIDEOS", "PODCAST"] as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!q) {
    return jsonOk({ posts: [], courses: [], events: [], products: [], knowledge: [] });
  }
  const contains = { contains: q, mode: "insensitive" as const };

  const { ctx } = await buildViewerContext(tenant, user);
  const spaces = await prisma.space.findMany({
    where: { tenantId: tenant.id, isArchived: false },
  });
  const accessible = spaces.filter((s) => canAccess(s, ctx));
  const accessibleIds = (types: readonly string[]) =>
    accessible.filter((s) => types.includes(s.type)).map((s) => s.id);
  const spaceById = new Map(accessible.map((s) => [s.id, s]));

  // ---- Posts (nur zugängliche Post-Spaces) --------------------------------
  const postSpaceIds = accessibleIds(POST_SPACE_TYPES);
  const now = new Date();
  const postRows = postSpaceIds.length
    ? await prisma.post.findMany({
        where: {
          tenantId: tenant.id,
          spaceId: { in: postSpaceIds },
          isPublished: true,
          publishedAt: { lte: now },
          OR: [{ title: contains }, { body: contains }],
        },
        orderBy: { createdAt: "desc" },
        take: MAX,
        include: { ...POST_INCLUDE, space: { select: { id: true, slug: true, type: true } } },
      })
    : [];
  // Pro Space serialisieren (spaceSlug/spaceType stehen im Post-DTO).
  const posts: PostDto[] = [];
  for (const row of postRows) {
    const [dto] = await postDtos(
      tenant.id,
      [row],
      { slug: row.space.slug, type: row.space.type },
      ctx,
      user.id,
    );
    if (dto) posts.push(dto);
  }

  // ---- Kurse / Events / Produkte / Knowledge ------------------------------
  const courseSpaceIds = accessibleIds(["COURSE"]);
  const courses = (
    await Promise.all(
      courseSpaceIds.map((id) => courseDtos(tenant.id, id, ctx, user.id)),
    )
  )
    .flat()
    .filter((c) => c.title.toLowerCase().includes(q.toLowerCase()))
    .slice(0, MAX);

  const eventSpaceIds = accessibleIds(["EVENTS"]);
  const events = eventSpaceIds.length
    ? (await eventDtos(tenant.id, ctx, user.id, eventSpaceIds))
        .filter((e) => e.title.toLowerCase().includes(q.toLowerCase()))
        .slice(0, MAX)
    : [];

  const hasShopAccess = accessibleIds(["SHOP"]).length > 0;
  const products = hasShopAccess
    ? (await productDtos(tenant.id, ctx, user.id))
        .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
        .slice(0, MAX)
    : [];

  const knowledgeSpaceIds = accessibleIds(["KNOWLEDGE"]);
  const knowledgeRows = knowledgeSpaceIds.length
    ? await prisma.knowledgeArticle.findMany({
        where: {
          tenantId: tenant.id,
          spaceId: { in: knowledgeSpaceIds },
          isPublished: true,
          OR: [{ title: contains }, { body: contains }],
        },
        orderBy: { updatedAt: "desc" },
        take: MAX,
      })
    : [];
  const knowledge = knowledgeRows
    .filter((a) => spaceById.has(a.spaceId))
    .map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      excerpt: excerpt(a.body, 220),
      bodyHtml: a.body,
      locked: false,
      updatedAt: a.updatedAt.toISOString(),
    }));

  return jsonOk({ posts, courses, events, products, knowledge });
}
