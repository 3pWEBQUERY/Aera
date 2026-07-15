import { z } from "zod";
import prisma from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { jsonError, jsonOk, parseJsonBody, requestIp, requireMobileAuth } from "@/lib/mobile/api";

// POST /api/mobile/v1/auth/change-password  { currentPassword, newPassword } → { token }
// sessionVersion wird inkrementiert — alle alten Tokens (Web + Mobile) sind
// danach ungültig; das neue JWT kommt in der Antwort zurück.
// Spiegelt changePasswordAction (app/actions/account.ts) inkl. Rate-Limit.

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const ip = requestIp(req);
  if (!(await rateLimit(`pwchange:${ip}`, 5, 10 * 60 * 1000))) {
    return jsonError("rate_limited", "Too many attempts. Try again later.", 429);
  }

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;

  const valid = await verifyPassword(parsed.data.currentPassword, auth.user.passwordHash);
  if (!valid) {
    return jsonError("invalid_credentials", "The current password is incorrect.", 401);
  }

  const updated = await prisma.user.update({
    where: { id: auth.user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      sessionVersion: { increment: 1 },
    },
  });
  await writeAudit({ actorUserId: auth.user.id, action: "user.password.change" });
  const token = await signSession({
    userId: updated.id,
    sessionVersion: updated.sessionVersion,
  });
  return jsonOk({ token });
}
