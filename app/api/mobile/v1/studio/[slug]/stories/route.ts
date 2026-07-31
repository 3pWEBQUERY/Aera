import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/mobile/api";
import { requireStudioAccess } from "@/lib/mobile/studio";
import { parseStorySettings } from "@/lib/space-settings";

// POST /api/mobile/v1/studio/{slug}/stories { mediaUrl, mediaType, caption?,
//   permanent?, ttlHours? }
//   → { id, mediaUrl, mediaType, caption, createdAt, expiresAt }  (Story-Shape
//     wie der STORIES-Space-Content, lib/mobile/serializers.ts)
// Persistenz exakt wie createStoryAction (app/actions/stories.ts):
// publishAt = jetzt; expiresAt = publishAt + Laufzeit — oder `null`, wenn die
// Story dauerhaft bleiben soll. Ohne Angabe gelten die Voreinstellungen des
// Space (defaultPermanent/defaultTtlHours), genau wie im Web-Formular.
// caption getrimmt auf 280 Zeichen, imageUrl/videoUrl je nach mediaType.
// Ziel-Space = erster STORIES-Space des Tenants; ohne einen solchen → 409
// `no_stories_space`. Rolle ≥ ADMIN (wie requireTenantAdmin im Web).

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
  /** Dauerhaft sichtbar — ohne Angabe entscheidet die Space-Voreinstellung. */
  permanent: z.boolean().optional(),
  /** Laufzeit in Stunden, 1–168 (wie ttlFrom in app/actions/stories.ts). */
  ttlHours: z.number().int().min(1).max(168).optional(),
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

  const storySettings = parseStorySettings(space.settings);
  const permanent = parsed.data.permanent ?? storySettings.defaultPermanent;
  const ttlHours = parsed.data.ttlHours ?? storySettings.defaultTtlHours;

  const publishAt = new Date();
  // null = laeuft nie ab. Das Fehlen eines Ablaufs ist ehrlicher als ein
  // Datum im Jahr 3000 (siehe Kommentar am Prisma-Feld).
  const expiresAt = permanent
    ? null
    : new Date(publishAt.getTime() + ttlHours * 3_600_000);

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
    caption: story.caption,
    createdAt: story.publishAt.toISOString(),
    expiresAt: story.expiresAt?.toISOString() ?? null,
  });
}
