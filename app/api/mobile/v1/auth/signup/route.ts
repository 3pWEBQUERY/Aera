import { z } from "zod";
import { registerUser } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { jsonError, jsonOk, parseJsonBody, requestIp } from "@/lib/mobile/api";
import { toUserDto } from "@/lib/mobile/serializers";

// POST /api/mobile/v1/auth/signup  { name, email, password } → { token, user }
// Rate-Limit wie Web-Signup (app/actions/auth.ts): 5/h/IP.

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const ip = requestIp(req);
  if (!(await rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000))) {
    return jsonError("rate_limited", "Too many signups. Try again later.", 429);
  }

  const parsed = await parseJsonBody(req, schema);
  if ("response" in parsed) return parsed.response;

  const result = await registerUser(parsed.data);
  if (!result.ok) {
    return jsonError("email_already_registered", "This e-mail is already registered.", 409);
  }
  const token = await signSession({
    userId: result.user.id,
    sessionVersion: result.user.sessionVersion,
  });
  return jsonOk({ token, user: toUserDto(result.user) });
}
