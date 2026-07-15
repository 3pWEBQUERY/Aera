import { z } from "zod";
import prisma, { withTenantTransaction } from "@/lib/prisma";
import { jsonError, jsonOk, parseJsonBody, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";

// POST /api/mobile/v1/c/{slug}/requests/{id}/vote  { dir } → { score, myVote }
// Logik gespiegelt aus voteRequestAction (app/actions/requests.ts): dieselbe
// Richtung entfernt den Vote, die Gegenrichtung dreht ihn; der denormalisierte
// Score wird atomar mitgeführt.

const schema = z.object({ dir: z.enum(["UP", "DOWN"]) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; requestId: string }> },
) {
  const { slug, requestId } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;
  const value = parsed.data.dir === "UP" ? 1 : -1;

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership?.status !== "ACTIVE") {
    return jsonError("not_member", "Active membership required.", 403);
  }

  const request = await prisma.memberRequest.findFirst({
    where: { id: requestId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!request) return jsonError("not_found", "Request not found.", 404);

  const existing = await prisma.requestVote.findUnique({
    where: { requestId_userId: { requestId: request.id, userId: user.id } },
  });

  let myVote: "UP" | "DOWN" | null = parsed.data.dir;
  await withTenantTransaction(async (tx) => {
    let delta = value;
    if (!existing) {
      await tx.requestVote.create({
        data: { tenantId: tenant.id, requestId: request.id, userId: user.id, value },
      });
    } else if (existing.value === value) {
      await tx.requestVote.delete({ where: { id: existing.id } });
      delta = -value;
      myVote = null;
    } else {
      await tx.requestVote.update({ where: { id: existing.id }, data: { value } });
      delta = 2 * value;
    }
    await tx.memberRequest.update({
      where: { id: request.id },
      data: { score: { increment: delta } },
    });
  });

  const updated = await prisma.memberRequest.findFirst({
    where: { id: request.id, tenantId: tenant.id },
    select: { score: true },
  });
  return jsonOk({ score: updated?.score ?? 0, myVote });
}
