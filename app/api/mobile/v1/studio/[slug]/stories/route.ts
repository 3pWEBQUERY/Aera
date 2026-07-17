import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";

// POST /api/mobile/v1/studio/{slug}/stories { mediaUrl, mediaType, caption? }
//   → { id, mediaUrl, mediaType, createdAt, expiresAt }  (Story-Shape wie der
//     STORIES-Space-Content der Community-API, lib/mobile/serializers.ts)
// Persistenz exakt wie createStoryAction (app/actions/stories.ts):
// publishAt = jetzt, expiresAt = publishAt + 24h (DEFAULT_TTL_HOURS),
// caption getrimmt auf 280 Zeichen, imageUrl/videoUrl je nach mediaType.
// Ziel-Space = erster STORIES-Space des Tenants; ohne einen solchen → 409
// `no_stories_space`. Rolle ≥ ADMIN (wie requireTenantAdmin im Web).

const DEFAULT_TTL_HOURS = 24; // wie app/actions/stories.ts

const createSchema = z.object({
  /** Nur eigene Upload-URLs (aus /studio/{slug}/upload purpose "story"). */
  mediaUrl: z
    .string()
    .min(1)
    .max(2048)
    .refine((u) => u.startsWith("/api/media/") || u.startsWith("/uploads/"), {
      message: "Must be an own upload URL (/api/media/… or /uploads/…).",
    }),
  mediaType: z.enum(["IMAGE", "VIDEO"]),
  caption: z.string().max(280).optional(),
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
  const { mediaUrl, mediaType } = parsed.data;

  // Erster STORIES-Space des Tenants (wie die Space-Auswahl im Web-Dashboard).
  const space = await prisma.space.findFirst({
    where: { tenantId: tenant.id, type: "STORIES", isArchived: false },
    orderBy: { sortOrder: "asc" },
  });
  if (!space) {
    return jsonError("no_stories_space", "This community has no stories space.", 409);
  }

  const publishAt = new Date();
  const expiresAt = new Date(publishAt.getTime() + DEFAULT_TTL_HOURS * 3_600_000);

  const story = await prisma.story.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      authorId: user.id,
      imageUrl: mediaType === "IMAGE" ? mediaUrl : null,
      videoUrl: mediaType === "VIDEO" ? mediaUrl : null,
      caption: parsed.data.caption?.trim().slice(0, 280) || null,
      publishAt,
      expiresAt,
    },
  });

  // Shape wie das Story-Item im STORIES-Content (createdAt = publishAt).
  return jsonOk({
    id: story.id,
    mediaUrl,
    mediaType,
    createdAt: story.publishAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
  });
}
