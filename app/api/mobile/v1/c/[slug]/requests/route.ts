import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk, parseJsonBody, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";
import { roleMapFor, toAuthor, type RequestDto } from "@/lib/mobile/serializers";

// POST /api/mobile/v1/c/{slug}/requests  { title, body, spaceSlug? } → Request-Objekt
// Logik gespiegelt aus submitRequestAction (app/actions/requests.ts). Ohne
// spaceSlug wird der erste REQUESTS-Space der Community verwendet.

const schema = z.object({
  title: z.string().min(2).max(160),
  body: z.string().max(4000).optional(),
  spaceSlug: z.string().optional(),
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

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership?.status !== "ACTIVE") {
    return jsonError("not_member", "Active membership required.", 403);
  }

  const space = await prisma.space.findFirst({
    where: {
      tenantId: tenant.id,
      type: "REQUESTS",
      ...(parsed.data.spaceSlug ? { slug: parsed.data.spaceSlug } : {}),
      isArchived: false,
    },
    orderBy: { sortOrder: "asc" },
  });
  if (!space) return jsonError("not_found", "Requests space not found.", 404);

  const request = await prisma.memberRequest.create({
    data: {
      tenantId: tenant.id,
      spaceId: space.id,
      requesterId: user.id,
      title: parsed.data.title.trim().slice(0, 160),
      body: (parsed.data.body ?? "").trim().slice(0, 4000),
      status: "OPEN",
    },
  });
  const roles = await roleMapFor(tenant.id, [user.id]);
  const dto: RequestDto = {
    id: request.id,
    title: request.title,
    body: request.body,
    status: request.status,
    score: request.score,
    myVote: null,
    priceCents: null,
    unlock: null,
    author: toAuthor({ id: user.id, name: user.name, avatarUrl: user.avatarUrl }, roles),
    createdAt: request.createdAt.toISOString(),
  };
  return jsonOk(dto);
}
