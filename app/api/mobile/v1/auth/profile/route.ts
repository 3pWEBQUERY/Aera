import { z } from "zod";
import prisma from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { jsonOk, parseJsonBody, requireMobileAuth } from "@/lib/mobile/api";
import { toUserDto } from "@/lib/mobile/serializers";

// PATCH /api/mobile/v1/auth/profile  { name?, avatarUrl? } → { user }
// Spiegelt updateMemberProfileAction (app/actions/account.ts).

const schema = z.object({
  name: z.string().min(2).max(60).optional(),
  avatarUrl: z.string().max(600).nullable().optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;
  const { name, avatarUrl } = parsed.data;

  const updated = await prisma.user.update({
    where: { id: auth.user.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl?.trim() || null } : {}),
    },
  });
  await writeAudit({ actorUserId: auth.user.id, action: "user.profile.update" });
  return jsonOk({ user: toUserDto(updated) });
}
