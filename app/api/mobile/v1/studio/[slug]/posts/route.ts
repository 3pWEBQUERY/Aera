import { z } from "zod";
import prisma from "@/lib/prisma";
import { indexContent } from "@/lib/ai";
import { cursorPagination, jsonError, jsonOk, parseJsonBody } from "@/lib/mobile/api";
import {
  requireStudioAccess,
  studioPostDtos,
  STUDIO_POST_INCLUDE,
} from "@/lib/mobile/studio";

// GET  /api/mobile/v1/studio/{slug}/posts?filter=scheduled|published&cursor=
//      → { data: StudioPost[], nextCursor }
// POST /api/mobile/v1/studio/{slug}/posts { spaceSlug, title?, body, publishedAt? }
//      → StudioPost — Planung gespiegelt aus createSpacePostAction
//      (app/actions/dashboard.ts): ISO-Zeitpunkt in der Zukunft ⇒
//      scheduledAt gesetzt + isPublished=false; der bestehende Cron
//      app/api/cron/posts veröffentlicht den Beitrag dann.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant } = access;

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter");
  const { limit, cursor } = cursorPagination(req);

  // scheduled: warten auf den Cron; published: live; ohne Filter: alles.
  const where =
    filter === "scheduled"
      ? { tenantId: tenant.id, isPublished: false, scheduledAt: { not: null } }
      : filter === "published"
        ? { tenantId: tenant.id, isPublished: true }
        : { tenantId: tenant.id };
  const orderBy =
    filter === "scheduled"
      ? [{ scheduledAt: "asc" as const }, { id: "asc" as const }]
      : [{ publishedAt: "desc" as const }, { id: "desc" as const }];

  const rows = await prisma.post.findMany({
    where,
    orderBy,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: STUDIO_POST_INCLUDE,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const data = await studioPostDtos(tenant.id, page);
  return jsonOk({ data, nextCursor: hasMore ? page[page.length - 1]!.id : null });
}

const createSchema = z.object({
  spaceSlug: z.string().min(1),
  title: z.string().max(160).optional(),
  body: z.string().min(1).max(20000),
  /** ISO-Datum; in der Zukunft ⇒ geplanter Beitrag (Cron veröffentlicht). */
  publishedAt: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await requireStudioAccess(req, slug);
  if ("response" in access) return access.response;
  const { tenant, user } = access;

  const parsed = await parseJsonBody(req, createSchema);
  if ("response" in parsed) return parsed.response;

  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, slug: parsed.data.spaceSlug },
  });
  if (!space) return jsonError("not_found", "Space not found.", 404);

  const title = parsed.data.title?.trim() || null;
  const body = parsed.data.body.trim();
  if (!body && !title) {
    return jsonError("validation", "body: Content is required.", 400);
  }

  // Scheduling exakt wie createSpacePostAction: nur ein gültiges Datum in der
  // Zukunft plant den Beitrag; sonst wird sofort veröffentlicht.
  const rawSchedule = parsed.data.publishedAt?.trim() ?? "";
  const scheduledDate = rawSchedule ? new Date(rawSchedule) : null;
  if (rawSchedule && (!scheduledDate || Number.isNaN(scheduledDate.getTime()))) {
    return jsonError("validation", "publishedAt: Invalid ISO date.", 400);
  }
  const validSchedule =
    scheduledDate && scheduledDate.getTime() > Date.now() ? scheduledDate : null;

  const post = await prisma.post.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      authorId: user.id,
      title,
      body,
      scheduledAt: validSchedule,
      // Geplante Beiträge veröffentlicht später /api/cron/posts.
      isPublished: validSchedule ? false : true,
      publishedAt: validSchedule ?? undefined,
    },
    include: STUDIO_POST_INCLUDE,
  });
  await indexContent({
    tenantId: tenant.id,
    sourceType: "POST",
    sourceId: post.id,
    title: title || undefined,
    content: body || title || space.name,
  });

  const [dto] = await studioPostDtos(tenant.id, [post]);
  return jsonOk(dto);
}
