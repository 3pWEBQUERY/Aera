import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { jsonError, jsonOk, parseJsonBody, requestIp } from "@/lib/mobile/api";
import { toUserDto } from "@/lib/mobile/serializers";

// POST /api/mobile/v1/auth/login  { email, password, totp? } → { token, user }
// Bei aktivem TOTP ohne/mit falschem Code: 401 totp_required.
// Rate-Limit wie Web-Login (app/actions/auth.ts): 10/10min/IP.

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().max(16).optional(),
});

export async function POST(req: Request) {
  const ip = requestIp(req);
  if (!(await rateLimit(`login:${ip}`, 10, 10 * 60 * 1000))) {
    return jsonError("rate_limited", "Too many login attempts. Try again later.", 429);
  }

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;

  const result = await authenticate(
    parsed.data.email,
    parsed.data.password,
    parsed.data.totp?.trim() || undefined,
  );
  if (!result.ok) {
    if (result.needsTotp) {
      return jsonError("totp_required", "A valid TOTP code is required.", 401);
    }
    return jsonError("invalid_credentials", "E-mail or password is incorrect.", 401);
  }
  const token = await signSession({
    userId: result.user.id,
    sessionVersion: result.user.sessionVersion,
  });
  return jsonOk({ token, user: toUserDto(result.user) });
}
